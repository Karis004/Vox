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
