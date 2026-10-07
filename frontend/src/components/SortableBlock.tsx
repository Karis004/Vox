import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bot, ChevronRight, GripVertical } from 'lucide-react'
import { blockIcons, blockLabels } from '../icons'
import type { BlockResult, BriefingBlock } from '../types'

interface SortableBlockProps {
  block: BriefingBlock
  index: number
  selected: boolean
  result?: BlockResult
  onSelect: () => void
  onToggle: () => void
}

function fallbackSummary(block: BriefingBlock): string {
  if (block.type === 'news') return `${block.config.scope === 'hong_kong' ? '香港' : '全球'}金融 · 最多 ${block.config.count || 2} 条`
  if (block.type === 'actuarial') return `精算与保险 · 最多 ${block.config.count || 2} 条`
  if (block.type === 'text') return String(block.config.content || '空文本')
  if (block.type === 'weather') return String(block.config.city || '未设置城市')
  if (block.type === 'stocks') {
    const symbols = Array.isArray(block.config.symbols) ? block.config.symbols : []
    return symbols.join(' · ') || '未设置股票'
  }
  return String(block.config.url || '未设置地址')
}

export function SortableBlock({
  block,
  index,
  selected,
  result,
  onSelect,
  onToggle,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })
  const Icon = blockIcons[block.type]
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`briefing-block ${selected ? 'is-selected' : ''} ${!block.enabled ? 'is-disabled' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onClick={onSelect}
    >
      <button
        className="drag-handle icon-button"
        {...attributes}
        {...listeners}
        aria-label={`拖动${block.name}`}
        title="拖动排序"
      >
        <GripVertical size={17} />
      </button>
      <span className="block-index">{String(index + 1).padStart(2, '0')}</span>
      <span className={`module-icon type-${block.type}`}>
        <Icon size={17} strokeWidth={1.8} />
      </span>
      <div className="block-main">
        <div className="block-title-line">
          <strong>{block.name}</strong>
          <code>{blockLabels[block.type]}</code>
          {block.ai.enabled && <Bot size={14} aria-label="已启用 AI" />}
        </div>
        <p className={result?.status === 'error' ? 'error-copy' : ''}>
          {result?.text || fallbackSummary(block)}
        </p>
      </div>
      <button
        className={`mini-switch ${block.enabled ? 'is-on' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        aria-label={`${block.enabled ? '停用' : '启用'}${block.name}`}
        aria-pressed={block.enabled}
        title={block.enabled ? '停用模块' : '启用模块'}
      >
        <span />
      </button>
      <ChevronRight className="block-chevron" size={17} />
    </article>
  )
}

