from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import quote

import httpx
from openai import APIStatusError, AsyncOpenAI

from backend.models import BlockResult, BlockTestResult, BriefingBlock, BriefingConfig, BriefingResult, NewsConfig
from backend.news import collect_news, news_messages, read_news_output
from backend.speech import SPEECH_RULES, speech_text
from backend.settings import Settings
from backend.template import HONG_KONG_TIMEZONE, available_variables, date_context, extract_path, render_template


logger = logging.getLogger(__name__)

WEATHER_CODES = {
    0: "晴朗",
    1: "大致晴朗",
    2: "局部多云",
    3: "阴天",
    45: "有雾",
    48: "雾凇",
    51: "有毛毛雨",
    53: "有毛毛雨",
    55: "有较强毛毛雨",
    61: "有小雨",
    63: "有中雨",
    65: "有大雨",
    71: "有小雪",
    73: "有中雪",
    75: "有大雪",
    80: "有阵雨",
    81: "有较强阵雨",
    82: "有强阵雨",
    95: "有雷雨",
    96: "有雷雨和冰雹",
    99: "有强雷雨和冰雹",
}


@dataclass
class SourceData:
    text: str
    context: dict[str, Any]
    raw: Any = None
    messages: list[dict[str, str]] | None = None
    warning: str | None = None


def format_error(exc: Exception) -> str:
    if isinstance(exc, APIStatusError):
        request_id = exc.response.headers.get("x-request-id")
        parts = [f"AI 服务 HTTP {exc.status_code}"]
        if request_id:
            parts.append(f"Request ID: {request_id}")
        parts.append(exc.response.text or str(exc))
        return "\n".join(parts)
    if isinstance(exc, httpx.HTTPStatusError):
        return f"数据源 HTTP {exc.response.status_code}\n{exc.response.text or str(exc)}"
    return f"{type(exc).__name__}: {exc}"


class BriefingExecutor:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client

    async def execute(self, config: BriefingConfig) -> BriefingResult:
        started = time.perf_counter()
        enabled_blocks = [block for block in config.blocks if block.enabled]
        results = await asyncio.gather(
            *(self._execute_block(block) for block in enabled_blocks)
        )
        text = config.separator.join(result.text for result in results if result.text).strip()
        return BriefingResult(
            text=text,
            generated_at=datetime.now(HONG_KONG_TIMEZONE).isoformat(timespec="seconds"),
            duration_ms=round((time.perf_counter() - started) * 1000),
            blocks=results,
        )

    async def _execute_block(self, block: BriefingBlock) -> BlockResult:
        started = time.perf_counter()
        try:
            source = await self._source(block)
            text = source.text

            status = "warning" if source.warning else "success"
            message = source.warning
            if block.ai.enabled and block.type not in ("news", "actuarial"):
                if not self.settings.openai_api_key:
                    status = "warning"
                    message = "未配置 OPENAI_API_KEY，已使用原始内容"
                else:
                    prompt = render_template(block.ai.prompt, source.context)
                    text = await self._polish_with_ai(self._ai_messages(text, prompt))
            text = speech_text(text)
            return BlockResult(
                id=block.id,
                name=block.name,
                type=block.type,
                status=status,
                text=text,
                message=message,
                duration_ms=round((time.perf_counter() - started) * 1000),
            )
        except Exception as exc:  # A failed source must not stop the full briefing.
            message = format_error(exc)
            logger.warning("Block %s failed: %s", block.id, message)
            return BlockResult(
                id=block.id,
                name=block.name,
                type=block.type,
                status="error",
                text=f"{block.name}暂时无法获取。",
                message=message,
                duration_ms=round((time.perf_counter() - started) * 1000),
            )

    async def test_block(self, block: BriefingBlock, with_ai: bool = False) -> BlockTestResult:
        source = await self._source(block)
        result = BlockTestResult(
            source_text=source.text,
            raw=source.raw,
            variables=available_variables(source.context),
            ai_messages=source.messages,
            ai_text=source.text if source.messages else None,
        )
        if with_ai and block.type not in ("news", "actuarial"):
            if not self.settings.openai_api_key:
                raise ValueError("尚未配置 OPENAI_API_KEY。请在服务端 .env 中设置后再测试 AI。")
            result.resolved_prompt = render_template(block.ai.prompt, source.context)
            result.ai_messages = self._ai_messages(source.text, result.resolved_prompt)
            result.ai_text = await self._polish_with_ai(result.ai_messages)
        return result

    async def _source(self, block: BriefingBlock) -> SourceData:
        if block.type in ("news", "actuarial"):
            config = NewsConfig.model_validate(block.config)
            raw = await collect_news(block.type, config, client=self.client)
            context = date_context()
            if not raw["articles"]:
                return SourceData(raw["scope"] + "。本次订阅来源中没有前一天或近期的可用更新。", context, raw,
                                  warning="；".join(raw["source_errors"]) or None)
            if not self.settings.openai_api_key:
                raise ValueError("新闻筛选与中文口播需要服务端已有的 OPENAI_API_KEY")
            config.prompt = render_template(config.prompt, context)
            messages = news_messages(block.type, config, raw)
            output = await self._polish_with_ai(messages, max_tokens=1000)
            try:
                text, selected = read_news_output(output, raw, config)
            except (ValueError, TypeError, AttributeError) as exc:
                messages.extend([
                    {"role": "assistant", "content": output},
                    {"role": "user", "content": f"请修正输出：{exc}。继续只返回指定JSON，不增加事实。英文公司采用名称表、常见简称或中文名，专业缩写用大写字母。"},
                ])
                output = await self._polish_with_ai(messages, max_tokens=1000)
                text, selected = read_news_output(output, raw, config)
            raw["selected_sources"] = selected
            warning = "；".join(raw["source_errors"]) or None
            return SourceData(text, context, raw, messages, warning)
        if block.type == "text":
            context = date_context()
            return SourceData(render_template(str(block.config.get("content", "")), context), context)
        if block.type == "weather":
            return await self._weather(block.config)
        if block.type == "stocks":
            return await self._stocks(block.config)
        return await self._http(block.config)

    async def _request_json(self, url: str, **kwargs: Any) -> Any:
        if self.client is not None:
            response = await self.client.get(url, timeout=10, **kwargs)
            response.raise_for_status()
            return response.json()
        async with httpx.AsyncClient(
            timeout=10,
            follow_redirects=True,
            headers={"User-Agent": "Vox/1.0"},
        ) as client:
            response = await client.get(url, **kwargs)
            response.raise_for_status()
            return response.json()

    async def _weather(self, config: dict[str, Any]) -> SourceData:
        city = str(config.get("city", "")).strip()
        geocoding = await self._request_json(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": city, "count": 1, "language": "zh", "format": "json"},
        )
        locations = geocoding.get("results", [])
        if not locations:
            raise ValueError(f"找不到城市：{city}")
        location = locations[0]
        forecast = await self._request_json(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": location["latitude"],
                "longitude": location["longitude"],
                "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
                "timezone": "auto",
                "forecast_days": 1,
            },
        )
        current = forecast["current"]
        daily = forecast["daily"]
        context = {
            **date_context(),
            "city": location.get("name", city),
            "country": location.get("country", ""),
            "condition": WEATHER_CODES.get(current.get("weather_code"), "天气状况未知"),
            "temperature": round(current["temperature_2m"]),
            "apparent_temperature": round(current["apparent_temperature"]),
            "wind_speed": round(current["wind_speed_10m"]),
            "max_temperature": round(daily["temperature_2m_max"][0]),
            "min_temperature": round(daily["temperature_2m_min"][0]),
            "precipitation_probability": round(daily["precipitation_probability_max"][0]),
        }
        template = str(config.get("template", "{{city}}现在{{condition}}，{{temperature}}摄氏度。"))
        return SourceData(
            render_template(template, context),
            context,
            {"location": location, "weather": forecast},
        )

    async def _stock_quote(self, symbol: str) -> dict[str, Any]:
        payload = await self._request_json(
            f"https://api.nasdaq.com/api/quote/{quote(symbol, safe='')}/info",
            params={"assetclass": "stocks"},
            headers={
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        )
        data = payload["data"]
        primary = data["primaryData"]
        current = float(str(primary["lastSalePrice"]).replace("$", "").replace(",", ""))
        change = float(str(primary["percentageChange"]).replace("%", "").replace(",", ""))
        return {
            "symbol": symbol.upper(),
            "price": current,
            "change": change,
            "currency": primary.get("currency") or "USD",
        }

    async def _stocks(self, config: dict[str, Any]) -> SourceData:
        symbols = [str(item).strip().upper() for item in config.get("symbols", []) if str(item).strip()]
        quotes = await asyncio.gather(
            *(self._stock_quote(symbol) for symbol in symbols),
            return_exceptions=True,
        )
        valid = [item for item in quotes if isinstance(item, dict)]
        if not valid:
            raise ValueError("没有取得有效行情")
        average = sum(item["change"] for item in valid) / len(valid)
        if average > 0.5:
            trend = "整体走高"
        elif average >= 0:
            trend = "小幅上涨"
        elif average >= -0.5:
            trend = "窄幅波动"
        else:
            trend = "整体走低"
        items = "，".join(
            f"{item['symbol']}报{item['price']:.2f}，{('上涨' if item['change'] >= 0 else '下跌')}{abs(item['change']):.2f}%"
            for item in valid
        )
        context = {
            **date_context(),
            "market_label": str(config.get("market_label", "关注的股票")),
            "trend": trend,
            "items": items,
            "average_change": f"{average:.2f}",
            "count": len(valid),
        }
        template = str(config.get("template", "{{market_label}}{{trend}}。{{items}}。"))
        return SourceData(render_template(template, context), context, valid)

    async def _http(self, config: dict[str, Any]) -> SourceData:
        raw_headers = config.get("headers", {})
        if not isinstance(raw_headers, dict):
            raise ValueError("请求头必须是键值对象")
        payload = await self._request_json(str(config["url"]), headers=raw_headers)
        selected = extract_path(payload, str(config.get("path", "")))
        context: dict[str, Any] = {**date_context(), "value": selected}
        if isinstance(selected, dict):
            context.update(selected)
        template = str(config.get("template", "{{value}}"))
        return SourceData(render_template(template, context), context, payload)

    @staticmethod
    def _ai_messages(text: str, prompt: str) -> list[dict[str, str]]:
        return [
            {
                "role": "system",
                "content": "你负责把结构化信息改写为简洁、自然、适合 TTS 的中文口播。只返回最终口播文字。\n" + SPEECH_RULES,
            },
            {
                "role": "user",
                "content": f"要求：{prompt or '保持事实准确，语言简洁自然。'}\n\n原始内容：\n{text}",
            },
        ]

    async def _polish_with_ai(self, messages: list[dict[str, str]], max_tokens: int = 300) -> str:
        client_kwargs: dict[str, str] = {"api_key": self.settings.openai_api_key}
        if self.settings.openai_base_url:
            client_kwargs["base_url"] = self.settings.openai_base_url
        async with AsyncOpenAI(**client_kwargs, timeout=45, max_retries=0) as client:
            response = await client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.4,
            )
        if not response.choices:
            raise ValueError("AI 服务没有返回任何候选结果")
        output = response.choices[0].message.content
        if not isinstance(output, str) or not output.strip():
            raise ValueError("AI 服务没有返回可用的文字内容")
        return output.strip()
