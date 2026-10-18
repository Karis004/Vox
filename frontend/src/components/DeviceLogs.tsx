import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { api } from '../api'
import type { DeviceHistory, DeviceLogEvent, DeviceScript } from '../types'

function hongKongDay() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-')
}

function describe(event: DeviceLogEvent) {
  const d = event.details
  if (event.kind === 'server.started') return '服务器启动'
  if (event.kind === 'server.stopped') return '服务器停止'
  if (event.kind === 'briefing.preparing') return '正在生成晨报'
  if (event.kind === 'briefing.ready') return `晨报已准备：${d.parts}段，${d.bytes}字节`
  if (event.kind === 'briefing.modules') return '各模块生成结果（展开查看失败类型与上游状态码）'
  if (event.kind === 'briefing.failed') return `晨报生成失败：${d.error_type}`
  if (d.path === '/device/time') return `校时请求 · HTTP ${d.status} · ${d.mode || '参数无效'} · 时差${d.drift_s ?? '未知'}秒`
  if (d.path === '/device/briefing') return `取晨报 · HTTP ${d.status} · ${d.state === 'ready' ? '已准备' : d.state === 'preparing' ? '等待生成' : '失败'}`
  if (d.path === '/device/briefing-part') return `取第${typeof d.part === 'number' ? d.part + 1 : '?'}段 · HTTP ${d.status} · ${d.bytes}字节${d.preload === 1 ? ' · 提前取稿' : ''}`
  if (d.path === '/device/event' && d.status === 200) return '主板报告：全部语音帧已发送，估算等待结束'
  return `${d.path || event.kind} · HTTP ${d.status || '?'}`
}

export function DeviceLogs({ onClose }: { onClose: () => void }) {
  const [day, setDay] = useState(hongKongDay)
  const [history, setHistory] = useState<DeviceHistory | null>(null)
  const [script, setScript] = useState<DeviceScript | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(0)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => { dialog.current?.showModal(); return () => { revision.current++ } }, [])

  async function load(older = false) {
    const request = ++revision.current
    setLoading(true); setError(null)
    try {
      const result = await api.deviceHistory(day, older ? history?.next_before : null)
      if (request !== revision.current) return
      setHistory(current => older && current ? { ...result, events: [...current.events, ...result.events] } : result)
    } catch (reason) {
      if (request === revision.current) setError(reason instanceof Error ? reason.message : '日志读取失败')
    } finally { if (request === revision.current) setLoading(false) }
  }

  useEffect(() => { setHistory(null); setScript(null); void load() }, [day]) // Explicit refresh; no background polling.

  async function readScript(id: string) {
    const request = ++revision.current
    setLoading(true); setError(null)
    try {
      const result = await api.deviceScript(id)
      if (request === revision.current) setScript(result)
    } catch (reason) {
      if (request === revision.current) setError(reason instanceof Error ? reason.message : '稿件读取失败')
    } finally { if (request === revision.current) setLoading(false) }
  }

  return (
    <dialog className="device-log-dialog" ref={dialog} aria-label="设备日志" onCancel={onClose}>
      <div className="device-log-heading"><strong>设备日志</strong><button className="icon-button" onClick={onClose} aria-label="关闭设备日志"><X size={18} /></button></div>
      <div className="device-log-toolbar">
        <label>香港日期 <input type="date" value={day} onChange={e => { if (e.target.value) setDay(e.target.value) }} /></label>
        <button className="run-button" onClick={() => { setScript(null); void load() }} disabled={loading}><RefreshCw size={15} />刷新</button>
        <a className="run-button" href={`/api/device-logs/export?day=${encodeURIComponent(day)}`}><Download size={15} />导出当天</a>
      </div>
      <p className="device-log-note">保留最近30天，最多10000条事件和200份稿件。请求日志表示服务器收到／交付，主板报告表示已发送语音帧；均不能证明喇叭实际读完。完全断网的请求不会到达服务器。</p>
      {error && <p role="alert" className="device-log-error">{error}</p>}
      <div className="device-log-content">
        <section aria-label="当天稿件">
          <h3>当天生成的稿件</h3>
          {history?.briefings.map(item => <button key={item.id} className="device-log-script" onClick={() => void readScript(item.id)} disabled={loading}>{item.created_at.slice(11, 19)} · {item.parts}段 · {item.bytes}字节 · {item.id}</button>)}
          {history && !history.briefings.length && <p>这一天没有保留的稿件。</p>}
          {script && <div className="device-log-transcript"><h3>稿件 {script.id}</h3><p>{script.text}</p><details><summary>分段与播放等待估算</summary>{script.parts.map(part => <div key={part.part}><strong>第{part.part + 1}段 · {part.bytes}字节 · 等待约{(part.estimated_wait_ms / 1000).toFixed(1)}秒</strong><p>{part.text}</p></div>)}</details></div>}
        </section>
        <section aria-label="设备事件">
          <h3>事件（最新在前）</h3>
          {history?.events.map(event => <details className="device-log-event" key={event.id}><summary><time>{event.at.slice(11, 23)}</time> {describe(event)}</summary><pre>{JSON.stringify(event.details, null, 2)}</pre></details>)}
          {history && !history.events.length && <p>这一天没有记录；日志启用前的历史无法补录。</p>}
          {loading && <p role="status">正在读取…</p>}
          {history?.next_before && <button className="run-button" disabled={loading} onClick={() => void load(true)}>加载更早记录</button>}
        </section>
      </div>
    </dialog>
  )
}
