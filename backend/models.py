from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator
from urllib.parse import urlsplit

from backend.news_sources import default_news_sources


BlockType = Literal["text", "weather", "stocks", "http", "news", "actuarial"]


class NewsSource(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: str = Field(max_length=2000)
    format: Literal['rss', 'json'] = 'rss'
    enabled: bool = True
    date_mode: Literal['timestamp', 'hong_kong_date'] = 'timestamp'
    items_path: str = Field(default='items', max_length=200)
    title_field: str = Field(default='title', max_length=200)
    url_field: str = Field(default='url', max_length=200)
    date_field: str = Field(default='published_at', max_length=200)
    summary_field: str = Field(default='summary', max_length=200)

    @model_validator(mode='after')
    def valid_url(self) -> 'NewsSource':
        try:
            parsed = urlsplit(self.url)
            valid = parsed.scheme in ('http', 'https') and bool(parsed.hostname)
            parsed.port
        except ValueError:
            valid = False
        if not valid:
            raise ValueError('新闻来源需要有效的HTTP或HTTPS地址')
        return self


class NewsConfig(BaseModel):
    topic: Literal['finance', 'insurance'] = 'finance'
    scope: Literal["global", "hong_kong"] = "global"
    count: int = Field(default=2, ge=1, le=3)
    prompt: str = Field(default="", max_length=6000)
    aliases: str = Field(default="", max_length=4000)
    lookback_days: int | None = Field(default=None, ge=1, le=30)
    sources: list[NewsSource] | None = Field(default=None, max_length=12)

    @model_validator(mode='after')
    def source_defaults(self) -> 'NewsConfig':
        if self.sources is None:
            self.sources = [NewsSource.model_validate(row) for row in default_news_sources(self.topic, self.scope)]
        if self.lookback_days is None:
            self.lookback_days = 7 if self.topic == 'insurance' else 2
        return self


class AIConfig(BaseModel):
    enabled: bool = False
    prompt: str = ""


class BriefingBlock(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    type: BlockType
    name: str = Field(min_length=1, max_length=50)
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)
    ai: AIConfig = Field(default_factory=AIConfig)

    @model_validator(mode='before')
    @classmethod
    def legacy_news(cls, value):
        if isinstance(value, dict) and value.get('type') == 'actuarial':
            value = {**value, 'type': 'news', 'config': {**value.get('config', {}), 'topic': 'insurance'}}
        return value

    @model_validator(mode="after")
    def validate_config(self) -> "BriefingBlock":
        if self.type == "text" and not isinstance(self.config.get("content", ""), str):
            raise ValueError("文本模块的 content 必须是字符串")
        if self.type == "weather" and not str(self.config.get("city", "")).strip():
            raise ValueError("天气模块需要城市名称")
        if self.type == "stocks":
            symbols = self.config.get("symbols", [])
            if not isinstance(symbols, list) or not symbols:
                raise ValueError("股票模块至少需要一个股票代码")
        if self.type == "http":
            url = str(self.config.get("url", ""))
            if not url.startswith(("http://", "https://")):
                raise ValueError("HTTP 模块只支持 http:// 或 https:// 地址")
        if self.type in ("news", "actuarial"):
            self.config = {**self.config, **NewsConfig.model_validate(self.config).model_dump()}
            from backend.speech import alias_map
            alias_map(str(self.config.get("aliases", "")))
        return self


class BriefingConfig(BaseModel):
    version: int = 1
    title: str = Field(default="我的晨间播报", min_length=1, max_length=80)
    separator: str = "\n"
    blocks: list[BriefingBlock] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def unique_block_ids(self) -> "BriefingConfig":
        ids = [block.id for block in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("模块 ID 不能重复")
        return self


class BlockResult(BaseModel):
    id: str
    name: str
    type: BlockType
    status: Literal["success", "warning", "error"] = "success"
    text: str = ""
    message: str | None = None
    duration_ms: int = 0
    diagnostics: dict[str, Any] | None = None


class BriefingResult(BaseModel):
    text: str
    generated_at: str
    duration_ms: int
    blocks: list[BlockResult]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    ai_configured: bool


class BlockTestRequest(BaseModel):
    block: BriefingBlock
    with_ai: bool = False


class VariableInfo(BaseModel):
    key: str
    value: Any


class BlockTestResult(BaseModel):
    source_text: str
    raw: Any = None
    variables: list[VariableInfo]
    resolved_prompt: str | None = None
    ai_messages: list[dict[str, str]] | None = None
    ai_text: str | None = None
