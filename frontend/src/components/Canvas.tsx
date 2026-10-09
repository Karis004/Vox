import { useEffect, useRef } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { AudioLines, LoaderCircle, Play, Radio } from 'lucide-react'
import type { BriefingBlock, BriefingResult } from '../types'
import { SortableBlock } from './SortableBlock'

interface CanvasProps {
  blocks: BriefingBlock[]
  selectedId: string | null
  preview: BriefingResult | null
  previewing: boolean
  onSelect: (id: string) => void
  onChange: (blocks: BriefingBlock[]) => void
  onPreview: () => void
}

export function Canvas({
  blocks,
  selectedId,
  preview,
  previewing,
  onSelect,
  onChange,
  onPreview,
}: CanvasProps) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex((block) => block.id === active.id)
    const newIndex = blocks.findIndex((block) => block.id === over.id)
    onChange(arrayMove(blocks, oldIndex, newIndex))
  }

  const resultMap = new Map(preview?.blocks.map((result) => [result.id, result]))

  return (
    <aside className="canvas panel-region" aria-label="模块列表与预览">
      <div className="canvas-topline">
        <span className="kicker">模块列表</span>
        <span className="count-mark">{String(blocks.length).padStart(2, '0')}</span>
      </div>
      <div className="canvas-scroll">
        <div className="sequence-heading">
          <span>拖动排序 · 点击编辑</span>
          <span>{blocks.filter((block) => block.enabled).length} 个启用</span>
        </div>

        {blocks.length ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map((block) => block.id)} strategy={rectSortingStrategy}>
              <div className="block-list" ref={listRef}>
                {blocks.map((block, index) => (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    index={index}
                    selected={selectedId === block.id}
                    result={resultMap.get(block.id)}
                    onSelect={() => onSelect(block.id)}
                    onToggle={() =>
                      onChange(
                        blocks.map((item) =>
                          item.id === block.id ? { ...item, enabled: !item.enabled } : item,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="empty-sequence">
            <AudioLines size={28} />
            <span>从模块库添加第一个模块</span>
          </div>
        )}
        <div className="preview-heading">
          <span className="kicker">完整稿预览</span>
          <button className="run-button" onClick={onPreview} disabled={previewing}>
            {previewing ? <LoaderCircle className="spin" size={16} /> : <Play size={16} fill="currentColor" />}
            {previewing ? '生成中' : '生成预览'}
          </button>
        </div>
        <section className={`transcript-output ${preview ? 'has-output' : ''}`} aria-live="polite">
          <div className="output-meta">
            <span><Radio size={14} />完整播报稿</span>
          </div>
          <p>{preview?.text || '点击生成，查看当前编排的完整文字。'}</p>
          {preview?.blocks.some((block) => block.message) && (
            <div className="preview-errors">
              {preview.blocks.filter((block) => block.message).map((block) => (
                <div key={block.id}>
                  <strong>{block.name}：{block.status === 'warning' ? '提示' : '出错'}</strong>
                  <pre>{block.message}</pre>
                </div>
              ))}
            </div>
          )}
          <AudioLines className="output-watermark" size={60} strokeWidth={1} />
        </section>
      </div>
    </aside>
  )
}
