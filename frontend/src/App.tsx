import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, Check, PanelRight, Save, SlidersHorizontal, Undo2, Waves } from 'lucide-react'
import { api } from './api'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { ModuleLibrary } from './components/ModuleLibrary'
import type { BriefingBlock, BriefingConfig, BriefingResult, CatalogItem } from './types'

type MobileView = 'library' | 'canvas' | 'inspector'

function createBlock(item: CatalogItem): BriefingBlock {
  // getRandomValues also works on the device-compatible public HTTP site.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return {
    id: `${item.type}-${id}`,
    type: item.type,
    name: item.name,
    enabled: true,
    config: structuredClone(item.defaults),
    ai: { enabled: false, prompt: '' },
  }
}

export default function App() {
  const [config, setConfig] = useState<BriefingConfig | null>(null)
  const [savedConfig, setSavedConfig] = useState<BriefingConfig | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<BriefingResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('inspector')
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const configRevision = useRef(0)

  const dirty = useMemo(
    () => config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  )
  const selectedBlock = config?.blocks.find((block) => block.id === selectedId) || null

  useEffect(() => {
    Promise.all([api.getConfig(), api.getCatalog()])
      .then(([nextConfig, nextCatalog]) => {
        setConfig(nextConfig)
        setSavedConfig(structuredClone(nextConfig))
        setCatalog(nextCatalog)
        setSelectedId(nextConfig.blocks[0]?.id || null)
      })
      .catch((reason: Error) => setError(reason.message))
  }, [])

  function updateConfig(next: BriefingConfig) {
    configRevision.current += 1
    setConfig(next)
    setPreview(null)
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }

  async function save() {
    if (!config) return
    const submitted = config
    setSaving(true)
    setError(null)
    try {
      const saved = await api.saveConfig(config)
      setConfig((current) => JSON.stringify(current) === JSON.stringify(submitted) ? saved : current)
      setSavedConfig(structuredClone(saved))
      showToast('编排已保存')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function generatePreview() {
    if (!config) return
    const submitted = config
    const revision = configRevision.current
    setPreviewing(true)
    setError(null)
    try {
      const result = await api.preview(submitted)
      if (configRevision.current === revision) setPreview(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成失败')
    } finally {
      setPreviewing(false)
    }
  }

  function addBlock(item: CatalogItem) {
    if (!config) return
    if (config.blocks.length >= 30) { showToast('最多添加 30 个模块'); return }
    const block = createBlock(item)
    updateConfig({ ...config, blocks: [...config.blocks, block] })
    setSelectedId(block.id)
    setMobileView('inspector')
    showToast(`已添加${item.name}`)
  }

  function updateBlock(block: BriefingBlock) {
    if (!config) return
    updateConfig({
      ...config,
      blocks: config.blocks.map((item) => (item.id === block.id ? block : item)),
    })
  }

  function deleteBlock() {
    if (!config || !selectedId) return
    const index = config.blocks.findIndex((block) => block.id === selectedId)
    const nextBlocks = config.blocks.filter((block) => block.id !== selectedId)
    updateConfig({ ...config, blocks: nextBlocks })
    setSelectedId(nextBlocks[Math.min(index, nextBlocks.length - 1)]?.id || null)
    setMobileView(nextBlocks.length ? 'inspector' : 'canvas')
  }

  function undoChanges() {
    if (!savedConfig) return
    configRevision.current += 1
    setConfig(structuredClone(savedConfig))
    setSelectedId((id) => savedConfig.blocks.some((block) => block.id === id) ? id : savedConfig.blocks[0]?.id || null)
    setPreview(null)
  }

  if (!config) {
    return (
      <div className="loading-screen">
        <Waves size={28} />
        <span>{error || '正在连接 Vox…'}</span>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Waves size={21} /></span>
          <span className="brand-name">VOX<span>.</span></span>
          <span className="brand-product">BROADCAST COMPOSER</span>
        </div>
        <div className="document-name">
          <span className={`status-dot ${dirty ? 'is-dirty' : ''}`} />
          <input
            value={config.title}
            onChange={(event) => updateConfig({ ...config, title: event.target.value })}
            aria-label="编排名称"
          />
        </div>
        <div className="header-actions">
          {dirty && (
            <button
              className="icon-button desktop-only"
              onClick={undoChanges}
              title="撤销未保存更改"
              aria-label="撤销未保存更改"
            >
              <Undo2 size={17} />
            </button>
          )}
          <button className="save-button" onClick={save} disabled={saving || !dirty}>
            {saving ? <span className="button-spinner" /> : dirty ? <Save size={16} /> : <Check size={16} />}
            {saving ? '保存中' : dirty ? '保存' : '已保存'}
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className={`mobile-panel ${mobileView === 'library' ? 'is-visible' : ''}`}>
          <ModuleLibrary catalog={catalog} onAdd={addBlock} />
        </div>
        <div className={`mobile-panel ${mobileView === 'canvas' ? 'is-visible' : ''}`}>
          <Canvas
            blocks={config.blocks}
            selectedId={selectedId}
            preview={preview}
            previewing={previewing}
            onSelect={(id) => {
              setSelectedId(id)
              if (window.innerWidth < 1000) setMobileView('inspector')
            }}
            onChange={(blocks) => updateConfig({ ...config, blocks })}
            onPreview={generatePreview}
          />
        </div>
        <div className={`mobile-panel ${mobileView === 'inspector' ? 'is-visible' : ''}`}>
          <Inspector
            block={selectedBlock}
            catalog={catalog}
            onChange={updateBlock}
            onDelete={deleteBlock}
            onClose={() => setMobileView('canvas')}
          />
        </div>
      </div>

      <nav className="mobile-nav" aria-label="工作台视图">
        <button className={mobileView === 'library' ? 'is-active' : ''} onClick={() => setMobileView('library')}>
          <Boxes size={18} />模块
        </button>
        <button className={mobileView === 'canvas' ? 'is-active' : ''} onClick={() => setMobileView('canvas')}>
          <SlidersHorizontal size={18} />列表
        </button>
        <button className={mobileView === 'inspector' ? 'is-active' : ''} onClick={() => setMobileView('inspector')}>
          <PanelRight size={18} />编辑
        </button>
      </nav>

      {toast && <div className="toast"><Check size={15} />{toast}</div>}
      {error && <button className="error-toast" onClick={() => setError(null)}>{error}<span>×</span></button>}
    </div>
  )
}
