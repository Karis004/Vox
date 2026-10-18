import { useEffect, useRef, useState, type RefObject } from 'react'
import { Bot, LoaderCircle, Trash2, X } from 'lucide-react'
import { api } from '../api'
import { blockLabels } from '../icons'
import { NewsSourceEditor } from './NewsSourceEditor'
import type { BlockTestResult, BriefingBlock, CatalogItem, NewsSource } from '../types'

interface InspectorProps {
  block: BriefingBlock | null
  catalog: CatalogItem[]
  onChange: (block: BriefingBlock) => void
  onDelete: () => void
  onClose: () => void
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className={mono ? 'mono' : ''}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  inputRef,
  onFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  inputRef?: RefObject<HTMLTextAreaElement>
  onFocus?: () => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        ref={inputRef}
        className="mono"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
      />
    </label>
  )
}

function HeadersEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2))
  const [valid, setValid] = useState(true)
  const lastSent = useRef(JSON.stringify(value))

  useEffect(() => {
    const serialized = JSON.stringify(value)
    if (serialized !== lastSent.current) {
      setDraft(JSON.stringify(value, null, 2))
      setValid(true)
      lastSent.current = serialized
    }
  }, [value])

  return (
    <label className={`field ${valid ? '' : 'has-error'}`}>
      <span>请求头 JSON</span>
      <textarea
        className="mono"
        rows={4}
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          try {
            const parsed = JSON.parse(next)
            if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error()
            setValid(true)
            lastSent.current = JSON.stringify(parsed)
            onChange(parsed)
          } catch {
            setValid(false)
          }
        }}
      />
      {!valid && <small className="field-error">JSON 格式不完整</small>}
    </label>
  )
}

function displayValue(value: unknown): string {
  const output = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  return output.length > 80 ? `${output.slice(0, 80)}…` : output
}

export function Inspector({ block, catalog, onChange, onDelete, onClose }: InspectorProps) {
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const requestNumber = useRef(0)
  const [activeField, setActiveField] = useState<'source' | 'prompt'>('source')
  const [sourceResult, setSourceResult] = useState<BlockTestResult | null>(null)
  const [aiResult, setAIResult] = useState<BlockTestResult | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [aiError, setAIError] = useState<string | null>(null)
  const [testingMode, setTestingMode] = useState<'source' | 'ai' | null>(null)

  const sourceKey = JSON.stringify(block && [
    block.id,
    block.type,
    block.type === 'weather' ? block.config.city : null,
    block.type === 'stocks' ? block.config.symbols : null,
    block.type === 'http' ? [block.config.url, block.config.path, block.config.headers] : null,
    block.type === 'news' || block.type === 'actuarial' ? block.config : null,
  ])

  useEffect(() => {
    requestNumber.current += 1
    setSourceResult(null)
    setAIResult(null)
    setSourceError(null)
    setAIError(null)
    setTestingMode(null)
    setActiveField('source')
  }, [sourceKey])

  useEffect(() => {
    setAIResult(null)
    setAIError(null)
  }, [block?.ai.prompt, block?.config.template, block?.config.content])

  if (!block) {
    return (
      <main className="inspector panel-region inspector-empty" aria-label="模块编辑">
        <span className="kicker">模块编辑</span>
        <div className="crosshair" />
        <p>选择一个模块</p>
      </main>
    )
  }

  function patchConfig(key: string, value: unknown) {
    onChange({ ...block!, config: { ...block!.config, [key]: value } })
  }

  async function runTest(withAI: boolean) {
    if (!block) return
    const mode = withAI ? 'ai' : 'source'
    const currentRequest = ++requestNumber.current
    setTestingMode(mode)
    if (withAI) setAIError(null)
    else setSourceError(null)
    try {
      const result = await api.testBlock(block, withAI)
      if (requestNumber.current !== currentRequest) return
      setSourceResult(result)
      if (withAI) setAIResult(result)
    } catch (reason) {
      if (requestNumber.current !== currentRequest) return
      const message = reason instanceof Error ? reason.message : '测试失败'
      if (withAI) setAIError(message)
      else setSourceError(message)
    } finally {
      if (requestNumber.current === currentRequest) setTestingMode(null)
    }
  }

  function insertVariable(key: string) {
    if (!block) return
    const intoPrompt = activeField === 'prompt' && block.ai.enabled
    const field = intoPrompt ? promptRef.current : sourceRef.current
    const current = intoPrompt ? block.ai.prompt : String(block.config[block.type === 'text' ? 'content' : 'template'] || '')
    const start = field && document.activeElement === field ? field.selectionStart : current.length
    const end = field && document.activeElement === field ? field.selectionEnd : current.length
    const token = `{{${key}}}`
    const next = current.slice(0, start) + token + current.slice(end)
    if (intoPrompt) onChange({ ...block, ai: { ...block.ai, prompt: next } })
    else patchConfig(block.type === 'text' ? 'content' : 'template', next)
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const staticVariables = catalog.find((item) => item.type === block.type)?.variables || []
  const isNews = block.type === 'news' || block.type === 'actuarial'
  const values = new Map(sourceResult?.variables.map((item) => [item.key, item.value]))
  const variables = [
    ...staticVariables,
    ...(sourceResult?.variables || [])
      .filter((item) => !staticVariables.some((known) => known.key === item.key))
      .map((item) => ({ key: item.key, description: '本次测试返回的字段' })),
  ]

  return (
    <main className="inspector panel-region" aria-label="模块编辑">
      <div className="inspector-header">
        <div className="inspector-header-title">
          <span className="kicker">模块编辑</span>
          <code>{blockLabels[block.type]} / {block.id.slice(0, 8).toUpperCase()}</code>
        </div>
        <div className="inspector-header-actions">
          <button className="danger-button icon-button" onClick={onDelete} title="删除模块" aria-label="删除模块">
            <Trash2 size={17} />
          </button>
          <button className="icon-button close-inspector" onClick={onClose} title="返回模块列表" aria-label="返回模块列表">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="inspector-scroll">
        <section className="property-section">
          <span className="section-number">01 / 基本</span>
          <TextField
            label="模块名称"
            value={block.name}
            onChange={(name) => onChange({ ...block, name })}
          />
          <label className="toggle-row">
            <span>参与播报</span>
            <input
              type="checkbox"
              checked={block.enabled}
              onChange={(event) => onChange({ ...block, enabled: event.target.checked })}
            />
            <span className="toggle-track"><span /></span>
          </label>
        </section>

        <section className="property-section">
          <span className="section-number">02 / 数据与格式</span>
          {isNews && (
            <>
              <label className="field"><span>预设</span>
                <select value={block.config.topic === 'insurance' ? 'insurance' : block.config.scope === 'hong_kong' ? 'finance_hong_kong' : 'finance_global'} onChange={event => {
                  const preset = catalog.find(item => item.type === 'news')?.presets?.find(item => item.id === event.target.value)
                  if (preset) onChange({ ...block, type: 'news', name: preset.name, config: structuredClone(preset.config) })
                }}>
                  {catalog.find(item => item.type === 'news')?.presets?.map(preset => <option value={preset.id} key={preset.id}>{preset.name}</option>)}
                </select>
              </label>
              <label className="field"><span>回顾天数</span><input type="number" min={1} max={30} value={Number(block.config.lookback_days || 2)} onChange={event => patchConfig('lookback_days', Number(event.target.value))} /></label>
              <NewsSourceEditor sources={(block.config.sources || []) as NewsSource[]} onChange={sources => patchConfig('sources', sources)} />
              <label className="field">
                <span>最多播报条数</span>
                <select value={Number(block.config.count || 2)} onChange={(event) => patchConfig('count', Number(event.target.value))}>
                  <option value={1}>1 条</option><option value={2}>2 条</option><option value={3}>3 条</option>
                </select>
              </label>
              <TextArea label="新闻编辑要求（Prompt）" value={String(block.config.prompt || '')}
                onChange={(value) => patchConfig('prompt', value)} rows={10} />
              <TextArea label="名称替换表（每行：原名=播报名称）" value={String(block.config.aliases || '')}
                onChange={(value) => patchConfig('aliases', value)} rows={7} />
              <p className="field-hint">保留熟悉简称；英文单词改为中文或简称，如 Prudential=PRU。</p>
            </>
          )}
          {block.type === 'text' && (
            <TextArea
              label="播报内容"
              value={String(block.config.content || '')}
              onChange={(value) => patchConfig('content', value)}
              inputRef={sourceRef}
              onFocus={() => setActiveField('source')}
              placeholder="今天是 {{date}}，{{weekday}}。"
              rows={7}
            />
          )}
          {block.type === 'weather' && (
            <>
              <TextField
                label="城市"
                value={String(block.config.city || '')}
                onChange={(value) => patchConfig('city', value)}
                placeholder="上海"
              />
              <TextArea
                label="输出模板"
                value={String(block.config.template || '')}
                onChange={(value) => patchConfig('template', value)}
                inputRef={sourceRef}
                onFocus={() => setActiveField('source')}
                rows={7}
              />
            </>
          )}
          {block.type === 'stocks' && (
            <>
              <TextField
                label="股票代码"
                value={(Array.isArray(block.config.symbols) ? block.config.symbols : []).join(', ')}
                onChange={(value) => patchConfig('symbols', value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))}
                placeholder="AAPL, TSLA, NVDA"
                mono
              />
              <TextField
                label="市场名称"
                value={String(block.config.market_label || '')}
                onChange={(value) => patchConfig('market_label', value)}
              />
              <TextArea
                label="输出模板"
                value={String(block.config.template || '')}
                onChange={(value) => patchConfig('template', value)}
                inputRef={sourceRef}
                onFocus={() => setActiveField('source')}
                rows={5}
              />
            </>
          )}
          {block.type === 'http' && (
            <>
              <TextField
                label="JSON API 地址"
                value={String(block.config.url || '')}
                onChange={(value) => patchConfig('url', value)}
                placeholder="https://api.example.com/data"
                mono
              />
              <TextField
                label="数据路径"
                value={String(block.config.path || '')}
                onChange={(value) => patchConfig('path', value)}
                placeholder="data.items.0.title"
                mono
              />
              <p className="field-hint">留空使用整个 JSON；例如填 data.items.0.title 可取第一条的标题。测试后可在下方查看实际字段。</p>
              <HeadersEditor
                key={block.id}
                value={(block.config.headers || {}) as Record<string, unknown>}
                onChange={(value) => patchConfig('headers', value)}
              />
              <TextArea
                label="输出模板"
                value={String(block.config.template || '')}
                onChange={(value) => patchConfig('template', value)}
                inputRef={sourceRef}
                onFocus={() => setActiveField('source')}
                placeholder="今日内容：{{value}}"
                rows={5}
              />
            </>
          )}
          <div className="source-test">
            <div className="source-test-heading">
              <strong>{isNews ? '新闻口播与来源' : 'AI 前的文字输出'}</strong>
              <button className="mini-action" onClick={() => runTest(false)} disabled={testingMode !== null}>
                {testingMode === 'source' && <LoaderCircle className="spin" size={13} />}
                {testingMode === 'source' ? '测试中' : isNews ? '生成新闻口播' : block.type === 'http' ? '测试 API 与文字' : '测试文字'}
              </button>
            </div>
            {sourceError && <pre className="test-error" role="alert">{sourceError}</pre>}
            {sourceResult && (
              <div className="test-result">
                <strong>上次测试生成的文字</strong>
                <p>{sourceResult.source_text || '（空内容，请检查数据路径或模板）'}</p>
                {isNews && <NewsSources raw={sourceResult.raw} />}
                {isNews && sourceResult.ai_messages && (
                  <details><summary>实际发送给 AI 的消息</summary>
                    {sourceResult.ai_messages.map((message, index) => <pre key={`${message.role}-${index}`}>{message.role}{'\n'}{message.content}</pre>)}
                  </details>
                )}
                {sourceResult.raw !== null && (
                  <details open={block.type === 'http'}>
                    <summary>查看 API 原始返回</summary>
                    <pre>{JSON.stringify(sourceResult.raw, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>

        {!isNews && <section className="property-section variable-section">
          <span className="section-number">03 / 可用变量</span>
          <p className="field-hint">
            点击变量插入到：{activeField === 'prompt' && block.ai.enabled ? 'AI Prompt' : '输出文本'}。
          </p>
          {block.type === 'http' && !sourceResult && (
            <p className="field-hint">先点上方的“测试 API 与文字”，查看原始 JSON 并自动发现可用字段。</p>
          )}
          <div className="variable-list">
            {variables.map((item) => (
              <button
                key={item.key}
                className="variable-item"
                title={item.description}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertVariable(item.key)}
              >
                <code>{`{{${item.key}}}`}</code>
                <span>{values.has(item.key) ? displayValue(values.get(item.key)) : item.description}</span>
              </button>
            ))}
          </div>
        </section>}

        {!isNews && <section className="property-section ai-section">
          <div className="ai-title-row">
            <span className="section-number">04 / AI 加工</span>
            <Bot size={17} />
          </div>
          <label className="toggle-row">
            <span>启用 AI</span>
            <input
              type="checkbox"
              checked={block.ai.enabled}
              onChange={(event) => onChange({ ...block, ai: { ...block.ai, enabled: event.target.checked } })}
            />
            <span className="toggle-track"><span /></span>
          </label>
          {block.ai.enabled && (
            <>
              <p className="field-hint">AI接收模块文字和此Prompt，变量会先替换。</p>
              <TextArea
                label="Prompt"
                value={block.ai.prompt}
                onChange={(prompt) => onChange({ ...block, ai: { ...block.ai, prompt } })}
                inputRef={promptRef}
                onFocus={() => setActiveField('prompt')}
                placeholder="参考 {{condition}} 和 {{temperature}}，写一句自然的播报。"
                rows={7}
              />
              <button className="mini-action test-ai-button" onClick={() => runTest(true)} disabled={testingMode !== null}>
                {testingMode === 'ai' && <LoaderCircle className="spin" size={13} />}
                {testingMode === 'ai' ? '测试中' : '测试 AI 回复'}
              </button>
              {aiError && <pre className="test-error" role="alert">{aiError}</pre>}
              {aiResult && (
                <div className="test-result">
                  <strong>实际发送给 AI 的消息</strong>
                  {aiResult.ai_messages?.map((message) => (
                    <div className="ai-message" key={message.role}>
                      <span>{message.role === 'system' ? '系统指令' : '用户消息'}</span>
                      <pre>{message.content}</pre>
                    </div>
                  ))}
                  <strong>AI 返回文字</strong>
                  <p>{aiResult.ai_text}</p>
                </div>
              )}
            </>
          )}
        </section>}
      </div>

    </main>
  )
}

function NewsSources({ raw }: { raw: unknown }) {
  const data = raw as { selected_sources?: Array<{ id: number; title: string; url: string; source: string; published_at: string }>; source_errors?: string[]; coverage?: string } | null
  return <div className="news-sources">
    {data?.selected_sources?.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
      {source.source} · {source.published_at.slice(0, 10)} · {source.title}
    </a>)}
    {data?.source_errors?.map((error) => <p className="field-error" key={error}>{error}</p>)}
    {data?.coverage && <p className="field-hint">{data.coverage}</p>}
  </div>
}
