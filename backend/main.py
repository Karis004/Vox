from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import asyncio
from contextlib import asynccontextmanager

import httpx
from openai import APIStatusError
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.defaults import MODULE_CATALOG
from backend import device_briefing
from backend.device_time import router as device_time_router
from backend.executor import BriefingExecutor, format_error
from backend.models import BlockTestRequest, BlockTestResult, BriefingConfig, BriefingResult, HealthResponse
from backend.repository import ConfigRepository
from backend.settings import Settings, get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    try:
        return await executor.test_block(request.block, request.with_ai)
    except Exception as exc:
        status_code = 400
        if isinstance(exc, APIStatusError):
            status_code = exc.status_code
        elif isinstance(exc, httpx.HTTPStatusError):
            status_code = exc.response.status_code
        raise HTTPException(status_code=status_code, detail=format_error(exc)) from exc


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
