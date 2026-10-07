from __future__ import annotations

import json
import re
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Any


TOKEN_PATTERN = re.compile(r"{{\s*([\w.]+)\s*}}")
HONG_KONG_TIMEZONE = timezone(timedelta(hours=8))


def _resolve(context: Mapping[str, Any], path: str) -> Any:
    value: Any = context
    for part in path.split("."):
        if isinstance(value, Mapping):
            value = value.get(part, "")
        elif isinstance(value, list) and part.isdigit():
            index = int(part)
            value = value[index] if index < len(value) else ""
        else:
            return ""
    return value


def render_template(template: str, context: Mapping[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        value = _resolve(context, match.group(1))
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    return TOKEN_PATTERN.sub(replace, template).strip()


def date_context(now: datetime | None = None) -> dict[str, str]:
    current = now or datetime.now(HONG_KONG_TIMEZONE)
    if current.tzinfo is not None:
        current = current.astimezone(HONG_KONG_TIMEZONE)
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    return {
        "date": f"{current.month}月{current.day}日",
        "year": str(current.year),
        "month": str(current.month),
        "day": str(current.day),
        "weekday": weekdays[current.weekday()],
        "time": current.strftime("%H:%M"),
    }


def extract_path(payload: Any, path: str) -> Any:
    if not path.strip():
        return payload
    return _resolve({"root": payload}, f"root.{path.strip('.')}")


def available_variables(context: Mapping[str, Any]) -> list[dict[str, Any]]:
    """List every value that the template resolver can address."""
    variables: list[dict[str, Any]] = []

    def visit(path: str, value: Any) -> None:
        variables.append({"key": path, "value": value})
        if isinstance(value, Mapping):
            for key, child in value.items():
                if isinstance(key, str) and re.fullmatch(r"\w+", key):
                    visit(f"{path}.{key}", child)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(f"{path}.{index}", child)

    for key, value in context.items():
        if re.fullmatch(r"\w+", key):
            visit(key, value)
    return variables
