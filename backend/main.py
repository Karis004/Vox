from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import asyncio
import time
import logging
import secrets
from contextlib import asynccontextmanager

import httpx
from openai import APIStatusError
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.defaults import MODULE_CATALOG
from backend import device_briefing, device_log
from backend.device_time import router as device_time_router
from backend.executor import BriefingExecutor, ai_request_details, format_error
from backend.diagnostics import failure_details
from backend.models import BlockTestRequest, BlockTestResult, BriefingConfig, BriefingResult, HealthResponse
from backend.repository import ConfigRepository
from backend.settings import Settings, ai_configuration, get_settings, reload_ai_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        device_log.store = device_log.DeviceLogStore(get_repository().database_path.with_name('device-log.db'))
    except Exception as exc:
        device_log.store = None
        logging.getLogger(__name__).warning('Device history unavailable (%s)', type(exc).__name__)
    device_log.record('server.started')
    device_briefing.morning = device_briefing.MorningBriefing(
        lambda: get_repository().get(), lambda: BriefingExecutor(get_settings()))
    prewarm = asyncio.create_task(device_briefing.morning.prewarm())
    try:
        yield
    finally:
        prewarm.cancel()
        await asyncio.gather(prewarm, return_exceptions=True)
        await device_briefing.morning.close()
        device_briefing.morning = None
        device_log.record('server.stopped')
        device_log.store = None


app = FastAPI(
    title="Vox Briefing API",
    version="1.0.0",
    description="模块化语音播报编排与生成服务",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(device_time_router)
app.include_router(device_briefing.router)
app.include_router(device_log.router)


@app.middleware('http')
async def device_request_history(request: Request, call_next):
    if not request.url.path.startswith('/device/'):
        return await call_next(request)
    started = time.perf_counter()
    request_id = secrets.token_hex(6)
    path = request.url.path if request.url.path in ('/device/time', '/device/time-speech',
        '/device/briefing', '/device/briefing-part', '/device/event') else '/device/(unknown)'
    await asyncio.to_thread(device_log.record, 'device.request.started',
                            **device_log.request_details(request), path=path, request_id=request_id)
    try:
        response = await call_next(request)
    except Exception as exc:
        device_log.record('device.request', path=path, status=500,
                          request_id=request_id,
                          duration_ms=round((time.perf_counter() - started) * 1000),
                          error_type=type(exc).__name__)
        raise
    details = device_log.request_details(request)
    details.update(path=path, status=response.status_code,
                   request_id=request_id,
                   duration_ms=round((time.perf_counter() - started) * 1000),
                   bytes=int(response.headers.get('content-length', 0)))
    await asyncio.to_thread(device_log.record, 'device.request', **details)
    response.headers['X-Vox-Request-ID'] = request_id
    return response


@lru_cache
def get_repository() -> ConfigRepository:
    return ConfigRepository(get_settings().vox_database_path)


def get_executor(settings: Settings = Depends(get_settings)) -> BriefingExecutor:
    return BriefingExecutor(settings)


@app.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(ai_configured=bool(settings.openai_api_key))


@app.get("/api/modules/catalog")
async def module_catalog() -> list[dict]:
    return MODULE_CATALOG


@app.get("/api/config", response_model=BriefingConfig)
async def read_config(repository: ConfigRepository = Depends(get_repository)) -> BriefingConfig:
    return repository.get()


@app.put("/api/config", response_model=BriefingConfig)
async def save_config(
    config: BriefingConfig,
    repository: ConfigRepository = Depends(get_repository),
) -> BriefingConfig:
    return repository.save(config)


@app.post("/api/preview", response_model=BriefingResult)
async def preview_config(
    config: BriefingConfig,
    executor: BriefingExecutor = Depends(get_executor),
) -> BriefingResult:
    return await executor.execute(config)


@app.post("/api/blocks/test", response_model=BlockTestResult)
async def test_block(
    request: BlockTestRequest,
    executor: BriefingExecutor = Depends(get_executor),
) -> BlockTestResult:
    started = time.perf_counter()
    try:
        result = await executor.test_block(request.block, request.with_ai)
        device_log.record('module.test', module_id=request.block.id, type=request.block.type, status='success',
                          duration_ms=round((time.perf_counter() - started) * 1000))
        return result
    except Exception as exc:
        device_log.record('module.test', module_id=request.block.id, type=request.block.type, status='error',
                          duration_ms=round((time.perf_counter() - started) * 1000), diagnostics=failure_details(exc))
        status_code = 400
        if isinstance(exc, APIStatusError):
            status_code = exc.status_code
        elif isinstance(exc, httpx.HTTPStatusError):
            status_code = exc.response.status_code
        raise HTTPException(status_code=status_code, detail=format_error(exc)) from exc


@app.get('/api/ai/status')
async def ai_status(settings: Settings = Depends(get_settings)):
    return JSONResponse(ai_configuration(settings), headers={'Cache-Control': 'no-store'})


@app.post('/api/device-logs/check-ai')
@app.post('/api/ai/check')
async def check_ai(executor: BriefingExecutor = Depends(get_executor)):
    started = time.perf_counter()
    messages = [{'role': 'user', 'content': '请只回复：测试通过。'}]
    details = ai_request_details(executor.settings, messages, 24, 30)
    device_log.record('diagnostic.ai', status='started', **details)
    try:
        configuration = ai_configuration(executor.settings)
        if not configuration['configured']:
            result = dict(status='error', diagnostics=dict(stage='ai', code='configuration',
                          summary='AI配置缺失或接口地址格式无效', next_step='检查服务器.env，然后重新读取配置。'))
        else:
            await asyncio.wait_for(executor._polish_with_ai(
                messages, max_tokens=24), timeout=30)
            result = dict(status='success')
    except asyncio.TimeoutError:
        result = dict(status='error', diagnostics=dict(stage='ai', code='timeout',
                      summary='AI测速超过30秒，已停止等待', next_step='检查供应商状态与服务器到上游的连接；稍后重试。'))
    except Exception as exc:
        result = dict(status='error', diagnostics=failure_details(exc, 'ai'))
    result['duration_ms'] = round((time.perf_counter() - started) * 1000)
    device_log.record('diagnostic.ai', **result, **details)
    return result


@app.post('/api/ai/reload')
async def reload_ai():
    try:
        settings = reload_ai_settings()
    except (OSError, ValueError):
        device_log.record('diagnostic.ai.reload', status='error')
        raise HTTPException(400, '读取失败：请检查.env文件和AI配置') from None
    # New manifests should use the new provider; keep issued ids and their parts
    # immutable for the device already reading them.
    if device_briefing.morning is not None:
        await device_briefing.morning.configuration_changed()
    device_log.record('diagnostic.ai.reload', status='success', configuration_id=settings._ai_config_id)
    return JSONResponse(ai_configuration(settings), headers={'Cache-Control': 'no-store'})


@app.get("/briefing", response_model=BriefingResult)
async def generate_briefing(
    repository: ConfigRepository = Depends(get_repository),
    executor: BriefingExecutor = Depends(get_executor),
) -> BriefingResult:
    return await executor.execute(repository.get())


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str) -> FileResponse:
        if path.startswith(("api/", "device/")):
            raise HTTPException(404, "接口不存在")
        requested = (FRONTEND_DIST / path).resolve()
        if path and FRONTEND_DIST.resolve() in requested.parents and requested.is_file():
            return FileResponse(requested)
        return FileResponse(FRONTEND_DIST / "index.html")
