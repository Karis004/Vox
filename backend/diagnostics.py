"""Bounded, actionable failure summaries. Never persist provider response bodies."""
import re

import httpx
from openai import APIConnectionError, APIStatusError, APITimeoutError


def http_failure(status: int, stage: str = 'ai') -> dict:
    label = 'AI服务' if stage == 'ai' else '数据源'
    if status == 401:
        code, summary, action = 'authentication', f'{label}拒绝认证', '检查服务端密钥是否有效；不要把密钥写入日志或网页。'
    elif status == 403:
        code, summary, action = 'access_denied', f'{label}拒绝访问', '检查账号、模型权限和供应商访问限制。'
    elif status == 404:
        code, summary, action = 'route_or_model', f'{label}未找到接口或模型', '检查服务端接口路径及模型名称是否与供应商一致。'
    elif status == 429:
        code, summary, action = 'rate_or_quota', f'{label}限流或额度不足', '在供应商侧检查额度与限流；等待后重试。'
    elif status >= 500:
        code, summary, action = 'upstream_unavailable', f'{label}返回HTTP {status}，上游当前不可用', '检查当前供应商及模型通道；此错误发生在服务器调用上游，不能据此判断主板Wi-Fi。'
    else:
        code, summary, action = 'http_error', f'{label}返回HTTP {status}', '使用模块测试查看详细错误，核对上游接口。'
    return dict(stage=stage, code=code, summary=summary, next_step=action, upstream_status=status)


def failure_details(exc: Exception, stage: str = 'module') -> dict:
    if isinstance(exc, (APIStatusError, httpx.HTTPStatusError)):
        result = http_failure(exc.status_code if isinstance(exc, APIStatusError) else exc.response.status_code,
                              'ai' if isinstance(exc, APIStatusError) else 'source')
        request_id = exc.response.headers.get('x-request-id', '')
        if re.fullmatch(r'[A-Za-z0-9_.:-]{1,96}', request_id):
            result['request_id'] = request_id
        return result
    if isinstance(exc, (APITimeoutError, httpx.TimeoutException)):
        return dict(stage='ai' if isinstance(exc, APITimeoutError) else stage, code='timeout',
                    summary='上游请求超时', next_step='核对服务器到供应商的连接和服务状态；稍后重试。')
    if isinstance(exc, (APIConnectionError, httpx.NetworkError)):
        return dict(stage='ai' if isinstance(exc, APIConnectionError) else stage, code='connection',
                    summary='服务器无法连接上游', next_step='检查服务端的DNS、网络、TLS和供应商地址；不要从主板接线开始排查。')
    return dict(stage=stage, code='validation' if isinstance(exc, ValueError) else 'unexpected',
                summary='内容或配置校验失败' if isinstance(exc, ValueError) else '执行发生异常',
                next_step='使用对应模块的测试按钮查看详细错误。')
