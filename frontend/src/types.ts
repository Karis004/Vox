export type BlockType = 'text' | 'weather' | 'stocks' | 'http' | 'news' | 'actuarial'

export interface AIConfig {
  enabled: boolean
  prompt: string
}

export interface BriefingBlock {
  id: string
  type: BlockType
  name: string
  enabled: boolean
  config: Record<string, unknown>
  ai: AIConfig
}

export interface BriefingConfig {
  version: number
  title: string
  separator: string
  blocks: BriefingBlock[]
}

export interface CatalogItem {
  type: BlockType
  name: string
  description: string
  defaults: Record<string, unknown>
  variables: Array<{ key: string; description: string }>
}

export interface BlockTestResult {
  source_text: string
  raw: unknown
  variables: Array<{ key: string; value: unknown }>
  resolved_prompt: string | null
  ai_messages: Array<{ role: string; content: string }> | null
  ai_text: string | null
}

export interface BlockResult {
  id: string
  name: string
  type: BlockType
  status: 'success' | 'warning' | 'error'
  text: string
  message?: string
  duration_ms: number
}

export interface BriefingResult {
  text: string
  generated_at: string
  duration_ms: number
  blocks: BlockResult[]
}

export interface DeviceLogEvent { id: number; at: string; kind: string; details: Record<string, unknown> }
export interface DeviceHistory {
  day: string
  events: DeviceLogEvent[]
  briefings: Array<{ id: string; created_at: string; parts: number; bytes: number }>
  next_before: number | null
  retention_days: number
  max_events: number
}
export interface DeviceScript {
  id: string
  created_at: string
  text: string
  parts: Array<{ part: number; bytes: number; characters: number; estimated_wait_ms: number; text: string }>
}
