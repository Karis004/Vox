import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, RefreshCw, Zap } from 'lucide-react'
import { DialogFrame } from './DialogFrame'
import { api } from '../api'
import type { AiCheck, AiConfiguration } from '../types'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const revision = useRef(0)
  const [configuration, setConfiguration] = useState<AiConfiguration | null>(null)
  const [busy, setBusy] = useState<'load' | 'reload' | 'check' | null>('load')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<AiCheck | null>(null)

  useEffect(() => {
    const request = ++revision.current
    api.aiConfiguration().then(value => {
      if (request === revision.current) setConfiguration(value)
    }).catch(reason => {
      if (request === revision.current) setError(reason instanceof Error ? reason.message : '读取失败')
    }).finally(() => { if (request === revision.current) setBusy(null) })
    return () => { revision.current++ }
  }, [])

  async function run(action: 'reload' | 'check') {
    const request = ++revision.current
    setBusy(action); setError(null); setNotice(null); setResult(null)
    try {
      if (action === 'reload') {
        const value = await api.reloadAi()
        if (request === revision.current) { setConfiguration(value); setNotice('配置已更新') }
      } else {
        const value = await api.checkAi()
        if (request === revision.current) setResult(value)
      }
    } catch (reason) {
      if (request === revision.current) setError(reason instanceof Error ? reason.message : '请求失败')
    } finally { if (request === revision.current) setBusy(null) }
  }

  return <DialogFrame title="设置" className="settings-dialog" onClose={onClose}>
    <section className="settings-section" aria-label="AI配置">
      <div className="settings-section-heading"><h3>AI</h3>{configuration && <span className={`settings-status ${configuration.configured ? 'is-ready' : ''}`}><span />{configuration.configured ? '已配置' : '未配置'}</span>}</div>
      {configuration ? <dl className="settings-fields">
        <div><dt>模型</dt><dd>{configuration.model || '—'}</dd></div>
        <div><dt>URL</dt><dd>{configuration.base_url || '—'}{!configuration.endpoint_valid && <span className="settings-field-error">格式无效</span>}</dd></div>
        <div><dt>密钥</dt><dd>{configuration.key_present ? '已设置' : '未设置'}</dd></div>
      </dl> : busy === 'load' && <p className="settings-loading">读取中…</p>}
      <div className="settings-actions">
        <button className="settings-reload" disabled={busy !== null} onClick={() => void run('reload')}>{busy === 'reload' ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}{busy === 'reload' ? '读取中…' : '重新读取配置'}</button>
        <button className="settings-check" disabled={busy !== null || !configuration?.configured} onClick={() => void run('check')}>{busy === 'check' ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}{busy === 'check' ? '测试中…' : 'AI测速'}</button>
      </div>
      <div aria-live="polite">
        {notice && <p className="settings-notice"><Check size={14} />{notice}</p>}
        {error && <p role="alert" className="settings-error">{error}</p>}
        {result && <div className={`settings-result ${result.status === 'success' ? 'is-success' : 'is-error'}`}>
          <div className="settings-result-heading"><strong>{result.status === 'success' ? '请求成功' : '请求失败'}</strong><span>{(result.duration_ms / 1000).toFixed(2)} s <small>/ {result.duration_ms} ms</small></span></div>
          {result.diagnostics && <><div className="settings-result-code">{result.diagnostics.upstream_status && <span>HTTP {result.diagnostics.upstream_status}</span>}{result.diagnostics.code && <code>{result.diagnostics.code}</code>}</div><p>{result.diagnostics.summary}</p></>}
        </div>}
      </div>
    </section>
  </DialogFrame>
}
