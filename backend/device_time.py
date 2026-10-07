"""Small device clock protocol; all calendar calculations use Hong Kong time."""
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse
from backend.template import HONG_KONG_TIMEZONE

router = APIRouter(prefix="/device")
HK = HONG_KONG_TIMEZONE


def time_plan(now: int, mode: str, board: int | None, hour: int, minute: int) -> str:
    if mode == "test":
        # Leave room for the first short speech before the regular wall-clock slots.
        next_event = ((now + 40) // 120 + 1) * 120
        sync = (now // 300 + 1) * 300
        period, delay = 120, 10
    else:
        local = datetime.fromtimestamp(now, HK)
        target = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target.timestamp() <= now:
            target += timedelta(days=1)
        next_event = int(target.timestamp())
        sync = (now // 3600 + 1) * 3600
        period, delay = 86400, 0
    drift = now - board if board is not None else 0
    # Plain ASCII keeps the AVR parser and RAM usage small; epoch values are UTC.
    return (f"v=1\nnow={now}\nsync={sync}\nnext={next_event}\n"
            f"period={period}\ndelay={delay}\ndrift={drift}\n")


@router.get("/time", response_class=PlainTextResponse)
async def device_time(
    mode: Literal["test", "daily"] = "test",
    board: int | None = Query(default=None, ge=1577836800, le=4102444800),
    hour: int = Query(default=7, ge=0, le=23),
    minute: int = Query(default=15, ge=0, le=59),
) -> PlainTextResponse:
    now = int(datetime.now(HK).timestamp())
    return PlainTextResponse(time_plan(now, mode, board, hour, minute),
                             headers={"Cache-Control": "no-store"})


@router.get("/time-speech", response_class=PlainTextResponse)
async def time_speech(
    event: int = Query(ge=1577836800, le=4102444800),
) -> PlainTextResponse:
    # Tell the listener both the scheduled slot and the actual server response time.
    target = datetime.fromtimestamp(event, HK)
    now = datetime.now(HK)
    message = (f"定时测试。计划{target.hour}点{target.minute}分{target.second}秒。"
               f"服务器现在{now.hour}点{now.minute}分{now.second}秒。")
    return PlainTextResponse(message, headers={"Cache-Control": "no-store"})
