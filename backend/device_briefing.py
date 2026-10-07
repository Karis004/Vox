"""One immutable morning script, served as small UTF-8 chunks to the AVR."""
import asyncio
import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from backend.executor import BriefingExecutor
from backend.models import BriefingConfig
from backend.template import HONG_KONG_TIMEZONE

router = APIRouter(prefix="/device")
logger = logging.getLogger(__name__)
CHUNK_BYTES = 180
MAX_BYTES = 180 * 128


def split_text(text: str) -> list[str]:
    text = text.replace("\x00", "").strip() or "今天没有启用的播报内容。"
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ValueError("晨报超过23040字节，请减少模块或缩短文字")
    parts = []
    while text:
        size, end, boundary = 0, 0, 0
        for index, char in enumerate(text):
            size += len(char.encode("utf-8"))
            if size > CHUNK_BYTES:
                break
            end = index + 1
            if char in "。！？；，\n.!?;" and size >= 60:
                boundary = end
        if end < len(text) and boundary:
            end = boundary
        parts.append(text[:end])
        text = text[end:]
    if len(parts) > 128:
        raise ValueError("晨报分段超过128段，请缩短文字")
    return parts


@dataclass
class Snapshot:
    token: str
    key: str
    created: datetime
    parts: list[str]


class MorningBriefing:
    def __init__(self, get_config: Callable[[], BriefingConfig], get_executor: Callable[[], BriefingExecutor]):
        self.get_config, self.get_executor = get_config, get_executor
        self.snapshots: dict[str, Snapshot] = {}
        self.task: asyncio.Task | None = None
        self.error: str | None = None

    def key(self, config: BriefingConfig, now: datetime) -> str:
        return now.date().isoformat() + hashlib.sha256(config.model_dump_json().encode()).hexdigest()

    def request(self, now: datetime | None = None) -> Snapshot | None:
        current = now or datetime.now(HONG_KONG_TIMEZONE)
        config = self.get_config()
        key = self.key(config, current)
        self.snapshots = {token: snapshot for token, snapshot in self.snapshots.items()
                          if current - snapshot.created < timedelta(hours=3)}
        cached = next((snapshot for snapshot in self.snapshots.values() if snapshot.key == key), None)
        if cached:
            return cached
        if self.task is None or self.task.done():
            self.error = None
            self.task = asyncio.create_task(self.prepare(config, key))
        return None

    async def prepare(self, config: BriefingConfig, key: str) -> None:
        try:
            result = await self.get_executor().execute(config)
            # Partial failures are the same spoken fallback as the website preview.
            if result.blocks and all(block.status == "error" for block in result.blocks):
                raise ValueError("所有启用模块生成失败，请在网页检查数据源与AI配置")
            parts = split_text(result.text)
            token = secrets.token_hex(6)
            self.snapshots[token] = Snapshot(token, key, datetime.now(HONG_KONG_TIMEZONE), parts)
            # Retain a few in-flight scripts after config changes, without unlimited memory.
            while len(self.snapshots) > 8:
                del self.snapshots[next(iter(self.snapshots))]
        except Exception as exc:
            self.error = str(exc)
            logger.warning("Morning briefing preparation failed: %s", exc)

    async def prewarm(self) -> None:
        while True:
            now = datetime.now(HONG_KONG_TIMEZONE)
            if 7 * 60 + 10 <= now.hour * 60 + now.minute <= 7 * 60 + 30:
                try:
                    self.request(now)
                except Exception as exc:
                    logger.warning("Morning briefing prewarm failed; will retry: %s", exc)
            await asyncio.sleep(30)

    async def close(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)


morning: MorningBriefing | None = None


@router.get("/briefing", response_class=PlainTextResponse)
async def manifest() -> PlainTextResponse:
    if morning is None:
        raise HTTPException(503, "晨报服务尚未启动")
    snapshot = morning.request()
    if snapshot is None:
        # Return immediately; an AVR must not wait for slow news/AI requests.
        return PlainTextResponse("Preparing morning briefing. Retry in 30 seconds.", status_code=503,
                                 headers={"Cache-Control": "no-store", "Retry-After": "30"})
    return PlainTextResponse(f"v=1\nid={snapshot.token}\nparts={len(snapshot.parts)}\n",
                             headers={"Cache-Control": "no-store"})


@router.get("/briefing-part", response_class=PlainTextResponse)
async def briefing_part(id: str = Query(pattern=r"^[0-9a-f]{12}$"), part: int = Query(ge=0, le=127)) -> PlainTextResponse:
    snapshot = morning.snapshots.get(id) if morning else None
    if snapshot is None or datetime.now(HONG_KONG_TIMEZONE) - snapshot.created >= timedelta(hours=3):
        raise HTTPException(410, "晨报快照已过期，请重新获取")
    if part >= len(snapshot.parts):
        raise HTTPException(404, "晨报段落不存在")
    return PlainTextResponse(snapshot.parts[part], headers={"Cache-Control": "no-store"})
