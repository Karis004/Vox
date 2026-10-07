import type { BlockTestResult, BriefingBlock, BriefingConfig, BriefingResult, CatalogItem } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const detail = payload?.detail
    const message = Array.isArray(detail)
      ? detail.map((item: { msg?: string }) => item.msg).join('；')
      : typeof detail === 'string' ? detail : JSON.stringify(detail)
    throw new Error(message || `请求失败 (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const api = {
  getConfig: () => request<BriefingConfig>('/api/config'),
  getCatalog: () => request<CatalogItem[]>('/api/modules/catalog'),
  saveConfig: (config: BriefingConfig) =>
    request<BriefingConfig>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  preview: (config: BriefingConfig) =>
    request<BriefingResult>('/api/preview', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  testBlock: (block: BriefingBlock, withAI = false) =>
    request<BlockTestResult>('/api/blocks/test', {
      method: 'POST',
      body: JSON.stringify({ block, with_ai: withAI }),
    }),
}
