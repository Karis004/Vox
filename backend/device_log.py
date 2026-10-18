"""Small, persistent device history. No request headers, URLs or API error bodies."""
import json
import logging
import re
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from backend.template import HONG_KONG_TIMEZONE as HK

RETENTION_DAYS, MAX_EVENTS, MAX_BRIEFINGS = 30, 10000, 200
router = APIRouter()
logger = logging.getLogger(__name__)
store = None


def module_outcomes(result):
    outcomes = []
    for block in result.blocks:
        item = {'id': block.id, 'type': block.type, 'status': block.status, 'duration_ms': block.duration_ms}
        message = block.message or ''
        status = re.match(r'(AI 服务|数据源) HTTP ([0-9]{3})(?:\n|$)', message)
        if status:
            item.update(error_kind='ai_http' if status[1] == 'AI 服务' else 'source_http',
                        upstream_status=int(status[2]))
        elif message.startswith('未配置 OPENAI_API_KEY'):
            item['error_kind'] = 'missing_ai_key'
        elif block.status == 'error':
            # Only known exception type names, never arbitrary exception messages/URLs.
            name = message.partition(':')[0]
            item['error_kind'] = name if name in ('ValueError', 'ReadTimeout', 'ConnectTimeout',
                'ConnectError', 'APIConnectionError', 'APITimeoutError') else 'module_error'
        elif block.status == 'warning':
            item['error_kind'] = 'partial_source_or_ai_warning'
        outcomes.append(item)
    return outcomes


class DeviceLogStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path, self.lock = path, Lock()
        with closing(self.connect()) as db, db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, day TEXT NOT NULL,
                    kind TEXT NOT NULL, details TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS events_day ON events(day, id);
                CREATE TABLE IF NOT EXISTS scripts (
                    token TEXT PRIMARY KEY, at TEXT NOT NULL, day TEXT NOT NULL,
                    parts INTEGER NOT NULL, bytes INTEGER NOT NULL, payload TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS scripts_day ON scripts(day, at);
            """)
        self.prune()

    def connect(self):
        db = sqlite3.connect(self.path, timeout=2)
        db.row_factory = sqlite3.Row
        return db

    def _prune(self, db):
        cutoff = (datetime.now(HK) - timedelta(days=RETENTION_DAYS)).isoformat(timespec="milliseconds")
        for table, column, maximum in [('events', 'id', MAX_EVENTS), ('scripts', 'token', MAX_BRIEFINGS)]:
            db.execute(f"DELETE FROM {table} WHERE at < ?", (cutoff,))
            db.execute(f"DELETE FROM {table} WHERE {column} NOT IN "
                       f"(SELECT {column} FROM {table} ORDER BY at DESC, {column} DESC LIMIT ?)", (maximum,))

    def prune(self):
        with self.lock, closing(self.connect()) as db, db:
            self._prune(db)

    def record(self, kind: str, details: dict):
        now = datetime.now(HK)
        with self.lock, closing(self.connect()) as db, db:
            db.execute("INSERT INTO events(at,day,kind,details) VALUES(?,?,?,?)",
                       (now.isoformat(timespec="milliseconds"), now.date().isoformat(), kind,
                        json.dumps(details, ensure_ascii=False)))
            self._prune(db)

    def archive(self, snapshot, result):
        # Keep the actual sent script, not configuration, headers or raw AI/source errors.
        payload = {'id': snapshot.token, 'created_at': snapshot.created.isoformat(),
                   'config_hash': snapshot.key[10:], 'text': ''.join(snapshot.parts),
                   'parts': [{'part': i, 'bytes': len(p.encode()), 'characters': len(p),
                              'estimated_wait_ms': len(p) * 450 + 1500, 'text': p}
                             for i, p in enumerate(snapshot.parts)],
                   'blocks': module_outcomes(result)}
        with self.lock, closing(self.connect()) as db, db:
            db.execute("INSERT OR REPLACE INTO scripts VALUES(?,?,?,?,?,?)",
                       (snapshot.token, snapshot.created.isoformat(), snapshot.created.date().isoformat(),
                        len(snapshot.parts), len(payload['text'].encode()), json.dumps(payload, ensure_ascii=False)))
            self._prune(db)

    def history(self, day: str, before: int | None, limit: int):
        self.prune()
        with self.lock, closing(self.connect()) as db:
            rows = db.execute("SELECT * FROM events WHERE day=? AND id<? ORDER BY id DESC LIMIT ?",
                              (day, before or 2**63-1, limit + 1)).fetchall()
            scripts = db.execute("SELECT token AS id,at AS created_at,parts,bytes FROM scripts "
                                 "WHERE day=? ORDER BY at DESC", (day,)).fetchall()
        events = [{'id': r['id'], 'at': r['at'], 'kind': r['kind'],
                   'details': json.loads(r['details'])} for r in rows[:limit]]
        return {'day': day, 'events': events, 'briefings': [dict(r) for r in scripts],
                'next_before': events[-1]['id'] if len(rows) > limit else None,
                'retention_days': RETENTION_DAYS, 'max_events': MAX_EVENTS}

    def script(self, token: str):
        self.prune()
        with self.lock, closing(self.connect()) as db:
            row = db.execute("SELECT payload FROM scripts WHERE token=?", (token,)).fetchone()
        return json.loads(row['payload']) if row else None


def record(kind: str, **details):
    if store is not None:
        try:
            store.record(kind, details)
        except Exception as exc:
            logger.warning("Device history write failed (%s)", type(exc).__name__)


def archive(snapshot, result):
    if store is not None:
        try:
            store.archive(snapshot, result)
        except Exception as exc:
            logger.warning("Device script archive failed (%s)", type(exc).__name__)


def require_store():
    if store is None:
        raise HTTPException(503, "设备日志尚未启动或无法写入，请检查服务器数据目录")
    return store


def request_details(request: Request) -> dict:
    """Whitelist bounded telemetry; never persist arbitrary query strings or headers."""
    query, result = request.query_params, {}
    for key, values in {'mode': ('test', 'daily'), 'trigger': ('button', 'daily'),
                        'fw': ('log1',), 'reason': ('boot', 'reset', 'save', 'hourly'),
                        'name': ('finished',)}.items():
        if query.get(key) in values:
            result[key] = query[key]
    token = query.get('id', '')
    if len(token) == 12 and all(c in '0123456789abcdef' for c in token):
        result['id'] = token
    for key in ('board', 'event', 'hour', 'minute', 'part', 'sent', 'sent_ms', 'wait_ms', 'fetch_ms', 'preload'):
        value = query.get(key, '')
        if value.isascii() and value.isdigit() and len(value) <= 10:
            result[key] = int(value)
    result.update(getattr(request.state, 'device_details', {}))
    return result


@router.get('/api/device-logs')
def history(day: date | None = None, before: int | None = Query(default=None, ge=1, le=2**63-1),
            limit: int = Query(default=100, ge=1, le=200)):
    return JSONResponse(require_store().history((day or datetime.now(HK).date()).isoformat(), before, limit),
                        headers={'Cache-Control': 'no-store'})


@router.get('/api/device-logs/briefings/{token}')
def script(token: str):
    if len(token) != 12 or any(c not in '0123456789abcdef' for c in token):
        raise HTTPException(422, '无效稿件编号')
    result = require_store().script(token)
    if result is None:
        raise HTTPException(404, '记录不存在或已超过保留期限')
    return JSONResponse(result, headers={'Cache-Control': 'no-store'})


@router.get('/api/device-logs/export')
def export(day: date | None = None):
    selected = (day or datetime.now(HK).date()).isoformat()
    log = require_store()
    data = log.history(selected, None, MAX_EVENTS)
    data['scripts'] = [log.script(s['id']) for s in data['briefings']]
    return JSONResponse(data, headers={'Content-Disposition': f'attachment; filename="vox-device-{selected}.json"',
                                      'Cache-Control': 'no-store'})


@router.get('/device/event', response_class=PlainTextResponse)
def device_event(name: str = Query(pattern=r'^finished$'), id: str = Query(pattern=r'^[0-9a-f]{12}$'),
                 sent: int = Query(ge=0, le=127), sent_ms: int = Query(ge=0, le=4294967295),
                 wait_ms: int = Query(ge=0, le=100000), fetch_ms: int = Query(ge=0, le=4294967295)):
    # Self-report means frames were sent and the estimated wait ended, not audible success.
    return PlainTextResponse('ok\n', headers={'Cache-Control': 'no-store'})
