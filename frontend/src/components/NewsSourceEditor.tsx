import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { NewsSource } from '../types'

const jsonFields = [
  ['items_path', '新闻列表路径', 'items'], ['title_field', '标题字段', 'title'],
  ['url_field', '链接字段', 'url'], ['date_field', '日期字段', 'published_at'],
  ['summary_field', '摘要字段', 'summary'],
] as const

export function NewsSourceEditor({ sources, onChange }: { sources: NewsSource[]; onChange: (sources: NewsSource[]) => void }) {
  function patch(index: number, values: Partial<NewsSource>) {
    onChange(sources.map((source, i) => i === index ? { ...source, ...values } : source))
  }
  return <div className="news-source-editors">
    <div className="news-source-heading"><strong>新闻来源</strong><button className="mini-action" disabled={sources.length >= 12} onClick={() => onChange([...sources, { name: '新来源', url: '', format: 'rss', date_mode: 'timestamp' }])}><Plus size={13} />添加来源</button></div>
    {sources.map((source, index) => <details className="news-source-editor" key={index}>
      <summary><span>{source.name}<small>GET · {source.format.toUpperCase()}<ChevronDown size={12} /></small></span><code>{source.url || '填写来源URL'}</code></summary>
      <div className="news-source-fields">
        <div className="news-source-actions"><label><input type="checkbox" checked={source.enabled !== false} onChange={e => patch(index, { enabled: e.target.checked })} />启用</label><button className="icon-button danger-button" aria-label={`删除${source.name}来源`} onClick={() => onChange(sources.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>
        <label className="field"><span>来源名称</span><input value={source.name} onChange={e => patch(index, { name: e.target.value })} /></label>
        <label className="field"><span>URL</span><input className="mono" value={source.url} onChange={e => patch(index, { url: e.target.value })} /></label>
        <label className="field"><span>响应格式</span><select value={source.format} onChange={e => patch(index, { format: e.target.value as NewsSource['format'] })}><option value="rss">RSS / XML</option><option value="json">JSON</option></select></label>
        <label className="field"><span>日期格式</span><select value={source.date_mode || 'timestamp'} onChange={e => patch(index, { date_mode: e.target.value as NewsSource['date_mode'] })}><option value="timestamp">带时区的日期时间</option><option value="hong_kong_date">香港日期 YYYY-MM-DD</option></select></label>
        {source.format === 'json' && jsonFields.map(([key, label, fallback]) => <label className="field" key={key}><span>{label}</span><input className="mono" value={source[key] ?? fallback} onChange={e => patch(index, { [key]: e.target.value })} /></label>)}
      </div>
    </details>)}
  </div>
}
