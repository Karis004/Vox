import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { api } from '../api'
import type { AiCheck, AiConfiguration, DeviceHistory, DeviceLogEvent, DeviceScript, DeviceStatus, FailureInfo } from '../types'

const stages: Record<string, string> = { uart: 'ESP串口', wifi: 'Wi-Fi连接', tcp: '服务器TCP连接', send: '发送请求', http: 'HTTP响应', sync: '主板校时', clock: '本地时钟', keys: '按钮', schedule: '播报时间', device: '设备', speech: '语音时序' }
const codes: Record<string, string> = { command: '开始执行', timeout: '等待响应超时', esp_error: 'ESP返回错误', http_ok: '已收到HTTP响应', http_error: 'HTTP失败', protocol_error: '连接或协议失败', sync_ok: '主板已应用时间', sync_failed: '主板校时失败', clock_wait: '尚未取得时间', clock_status: '当前时钟', waiting: '等待网络', reset: '请求重新校时', schedule: '保存的播报时间', key: '按键', requested: '请求补听', stopped: '停止后续播报', slow_response: '响应超过校时精度门槛', invalid_plan: '时间计划解析失败', part_sent: '语音帧已发送', voice_rate: '等待系数调整', wait_estimate: '本段估算等待' }

function failure(value: unknown): FailureInfo | null {
  return value && typeof value === 'object' ? value as FailureInfo : null
}

function Failure({ info }: { info: FailureInfo }) {
  return <p className="device-log-error">{info.summary}{info.next_step && <><br />{info.next_step}</>}</p>
}

function hongKongDay() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-')
}

function describe(event: DeviceLogEvent) {
  const d = event.details
  if (event.kind === 'device.serial') return `USB采集 · ${stages[String(d.stage)] || d.stage} · ${codes[String(d.code)] || d.code}${d.command ? ` · ${d.command}` : ''}${d.hour !== undefined ? ` · ${d.hour}:${String(d.minute).padStart(2, '0')}` : ''}`
  if (event.kind === 'device.request.started') return `服务器收到请求 · ${d.path} · 编号${d.request_id}`
  if (event.kind === 'module.source') return `${d.type === 'news' ? '金融新闻' : '精算与保险'} · 抓取来源 · ${d.status}${d.articles !== undefined ? ` · ${d.articles}条材料，${d.source_errors}个来源错误` : ''}`
  if (event.kind === 'source.request') return `新闻来源 · ${d.source} · ${d.status}${d.http_status !== undefined ? ` · HTTP ${d.http_status}` : ''}${d.articles !== undefined ? ` · ${d.articles}条` : ''}`
  if (event.kind === 'module.ai' || event.kind === 'diagnostic.ai') return `${event.kind === 'diagnostic.ai' ? 'AI连通检查' : '新闻AI整理'} · ${d.status}${failure(d.diagnostics)?.summary ? ` · ${failure(d.diagnostics)?.summary}` : ''}`
  if (event.kind === 'module.test') return '网页模块测试失败'
  if (event.kind === 'module.fallback') return 'AI不可用，已改读带日期和来源的中文标题'
  if (event.kind === 'server.started') return '服务器启动'
  if (event.kind === 'server.stopped') return '服务器停止'
  if (event.kind === 'briefing.preparing') return '正在生成晨报'
  if (event.kind === 'briefing.ready') return `晨报已准备：${d.parts}段，${d.bytes}字节`
  if (event.kind === 'briefing.modules') return '各模块生成结果（展开查看失败类型与上游状态码）'
  if (event.kind === 'briefing.failed') return `晨报生成失败：${d.error_type}`
  if (d.path === '/device/time') return `校时响应 · HTTP ${d.status} · ${d.fw === 'log1' ? '带固件标识' : '来源未确认／接口检查'} · ${d.status === 200 ? '已返回计划，尚不证明主板应用' : '请求失败'} · 时差${d.drift_s ?? '未知'}秒`
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
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState<DeviceStatus | null>(null)
  const [aiCheck, setAiCheck] = useState<AiCheck | null>(null)
  const [aiConfiguration, setAiConfiguration] = useState<AiConfiguration | null>(null)
  const [checkingAi, setCheckingAi] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const revision = useRef(0)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => { dialog.current?.showModal(); return () => { revision.current++ } }, [])

  async function load(older = false) {
    const request = ++revision.current
    setLoading(true); setError(null)
    try {
      const [result, deviceStatus, configuration] = await Promise.all([api.deviceHistory(day, older ? history?.next_before : null, category), api.deviceStatus(), api.aiConfiguration()])
      if (request !== revision.current) return
      setStatus(deviceStatus)
      setAiConfiguration(configuration)
      setHistory(current => older && current ? { ...result, events: [...current.events, ...result.events] } : result)
    } catch (reason) {
      if (request === revision.current) setError(reason instanceof Error ? reason.message : '日志读取失败')
    } finally { if (request === revision.current) setLoading(false) }
  }

  useEffect(() => { setHistory(null); setScript(null); void load() }, [day, category]) // Explicit refresh; no background polling.

  async function checkAi() {
    const request = ++revision.current
    setLoading(true); setCheckingAi(true); setError(null); setAiCheck(null)
    try {
      const result = await api.checkAi()
      if (request !== revision.current) return
      setAiCheck(result); await load()
    } catch (reason) { if (request === revision.current) setError(reason instanceof Error ? reason.message : '检查失败') }
    finally { setCheckingAi(false); if (request === revision.current) setLoading(false) }
  }

  async function importFile(file?: File) {
    if (!file) return
    const request = ++revision.current
    setLoading(true); setError(null); setImportResult(null)
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('请导入不超过2MB的采集文件')
      const text = (await file.text()).replace(/^\uFEFF/, '').trim()
      const events: unknown[] = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
      if (!Array.isArray(events) || !events.length || events.length > 10000) throw new Error('采集文件须含1至10000条事件')
      let imported = 0, duplicates = 0
      for (let offset = 0; offset < events.length; offset += 500) {
        if (request !== revision.current) return
        const result = await api.importDeviceLogs(events.slice(offset, offset + 500))
        imported += result.imported; duplicates += result.duplicates
      }
      if (request !== revision.current) return
      setImportResult(`已导入${imported}条USB事件，跳过${duplicates}条重复。按采集时的香港日期查看。`)
      await load()
    } catch (reason) { if (request === revision.current) setError(reason instanceof Error ? reason.message : '导入失败') }
    finally { if (request === revision.current) setLoading(false); if (fileInput.current) fileInput.current.value = '' }
  }

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
    <dialog className="device-log-dialog" ref={dialog} aria-label="AI状态与设备日志" onCancel={onClose}>
      <div className="device-log-heading"><strong>AI状态与设备日志</strong><button className="icon-button" onClick={onClose} aria-label="关闭设备日志"><X size={18} /></button></div>
      <section className="device-log-status" aria-label="AI配置与测速">
        <h3>AI配置与测速</h3>
        {aiConfiguration ? <p>当前运行配置：{aiConfiguration.configured ? '已读取必要配置' : '配置不完整或格式有误'} · 密钥{aiConfiguration.key_present ? '已设置' : '未设置'} · 模型{aiConfiguration.model_present ? '已设置' : '未设置'} · 接口{!aiConfiguration.endpoint_valid ? '格式无效' : aiConfiguration.endpoint_mode === 'custom' ? '自定义地址已设置' : '使用默认地址'}</p> : <p>正在读取配置状态…</p>}
        <p className="device-log-note">只显示服务器已加载的脱敏状态，不显示或修改.env。配置齐全不代表密钥、余额或模型可用；修改服务器.env后需要重新创建容器。</p>
        <button className="run-button" disabled={loading || !aiConfiguration?.configured} onClick={() => void checkAi()}>{checkingAi ? '正在测速，最多等待30秒…' : 'AI测速（少量调用）'}</button>
        <div aria-live="polite">{aiCheck && <><p className={aiCheck.status === 'success' ? 'device-log-note' : 'device-log-error'}>{aiCheck.status === 'success' ? 'AI小请求成功' : 'AI小请求失败'} · 耗时{(aiCheck.duration_ms / 1000).toFixed(2)}秒（{aiCheck.duration_ms}ms）</p>{aiCheck.diagnostics && <Failure info={aiCheck.diagnostics} />}</>}</div>
        <p className="device-log-note">测速从服务器发起，测量一次短文本生成的总耗时；不查询余额，也不代表整篇新闻或所有来源均正常。</p>
      </section>
      <div className="device-log-toolbar">
        <label>香港日期 <input type="date" value={day} onChange={e => { if (e.target.value) setDay(e.target.value) }} /></label>
        <label>事件 <select value={category} onChange={e => setCategory(e.target.value)}><option value="all">全部</option><option value="sync">校时</option><option value="network">网络与HTTP</option><option value="news">新闻与AI</option><option value="serial">USB设备采集</option></select></label>
        <button className="run-button" onClick={() => { setScript(null); void load() }} disabled={loading}><RefreshCw size={15} />刷新</button>
        <a className="run-button" href={`/api/device-logs/export?day=${encodeURIComponent(day)}`}><Download size={15} />导出当天</a>
        <button className="run-button" disabled={loading} onClick={() => fileInput.current?.click()}>导入USB日志</button>
        <input ref={fileInput} type="file" accept=".jsonl,.json" hidden onChange={e => void importFile(e.target.files?.[0])} />
      </div>
      <p className="device-log-note">保留最近30天，最多10000条事件和200份稿件。请求日志表示服务器收到／交付，主板报告表示已发送语音帧；均不能证明喇叭实际读完。完全断网的请求不会到达服务器。</p>
      {error && <p role="alert" className="device-log-error">{error}</p>}
      {importResult && <p role="status" className="device-log-note">{importResult}</p>}
      <div className="device-log-content">
        <section className="device-log-status" aria-label="最新设备状态">
          <h3>最新已知状态（最近30天，不随日期筛选）</h3>
          <p>主板请求：{status?.last_firmware_request ? `${status.last_firmware_request.at} · ${status.last_firmware_request.details.path}` : '尚无带固件标识的请求。网页接口检查不算实机请求。'}</p>
          <p>校时响应：{status?.last_sync_response ? `HTTP ${status.last_sync_response.details.status} · ${status.last_sync_response.at}` : '尚未收到可识别的主板校时请求。'}</p>
          <p>最近捕获的校时结果：{status?.last_sync_report ? `${describe(status.last_sync_report)} · ${status.last_sync_report.at}` : '暂无设备端确认；服务器返回200不代表主板校时完成。'}</p>
          <p>最近设备时钟：{status?.last_clock_state ? `${describe(status.last_clock_state)} · ${status.last_clock_state.at}` : '尚未采集时钟状态。'}</p>
          {status?.last_serial_failure && <p className="device-log-error">最近设备故障：{describe(status.last_serial_failure)} · {status.last_serial_failure.at}</p>}
          {status?.last_serial_failure?.details.stage === 'uart' && <p>该故障发生在ESP串口命令阶段，尚不能归因于服务器或Wi-Fi密码。先检查ESP的3.3V供电、EN、共地及D0/D1串口路径；可先将整套设备两路USB都断开数秒后重接，再采集比较。灯亮不能证明串口通信正常。</p>}
          <p>请求没到服务器时，网页无法知道卡在供电、ESP串口还是Wi-Fi。连接电脑运行 scripts/capture-device.ps1，再导入采集文件；无需重刷现有固件。导入时间来自采集电脑，并非离线主板的准确时钟。</p>
          {status?.modules.filter(item => item.status !== 'success' && item.diagnostics).map((item, index) => <div key={index}><strong>{item.type === 'news' ? '金融新闻' : item.type === 'actuarial' ? '精算与保险' : item.type} · {item.status === 'error' ? '最近生成失败' : '使用降级播报'}（{status.modules_at}）</strong>{item.diagnostics && <Failure info={item.diagnostics} />}</div>)}
        </section>
        <section aria-label="当天稿件">
          <h3>当天生成的稿件</h3>
          {history?.briefings.map(item => <button key={item.id} className="device-log-script" onClick={() => void readScript(item.id)} disabled={loading}>{item.created_at.slice(11, 19)} · {item.parts}段 · {item.bytes}字节 · {item.id}</button>)}
          {history && !history.briefings.length && <p>这一天没有保留的稿件。</p>}
          {script && <div className="device-log-transcript"><h3>稿件 {script.id}</h3><p>{script.text}</p><details><summary>分段与播放等待估算（实际以主板wait_ms为准）</summary>{script.parts.map(part => <div key={part.part}><strong>第{part.part + 1}段 · {part.bytes}字节 · 旧450系数约{(part.estimated_wait_ms / 1000).toFixed(1)}秒 · 新400系数约{((part.characters * 400 + 1500) / 1000).toFixed(1)}秒</strong><p>{part.text}</p></div>)}</details></div>}
        </section>
        <section aria-label="设备事件">
          <h3>事件（按入库顺序最新在前；USB显示采集时间）</h3>
          {history?.events.map(event => <details className="device-log-event" key={event.id}><summary><time>{event.at.slice(11, 23)}</time> {describe(event)}</summary>{failure(event.details.diagnostics) && <Failure info={failure(event.details.diagnostics)!} />}<pre>{JSON.stringify(event.details, null, 2)}</pre></details>)}
          {history && !history.events.length && <p>这一天没有记录；日志启用前的历史无法补录。</p>}
          {loading && <p role="status">正在读取…</p>}
          {history?.next_before && <button className="run-button" disabled={loading} onClick={() => void load(true)}>加载更早记录</button>}
        </section>
      </div>
    </dialog>
  )
}
