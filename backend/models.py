from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


BlockType = Literal["text", "weather", "stocks", "http", "news", "actuarial"]


class NewsConfig(BaseModel):
    scope: Literal["global", "hong_kong"] = "global"
    count: int = Field(default=2, ge=1, le=3)
    prompt: str = Field(default="", max_length=6000)
    aliases: str = Field(default="", max_length=4000)


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
            NewsConfig.model_validate(self.config)
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
