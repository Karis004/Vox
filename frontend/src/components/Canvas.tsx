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
    <aside className="canvas panel-region" aria-label="播报稿预览与顺序">
      <div className="canvas-topline">
        <div>
          <span className="kicker">COMPOSITION</span>
          <h1>播报稿</h1>
        </div>
        <button className="run-button" onClick={onPreview} disabled={previewing}>
          {previewing ? <LoaderCircle className="spin" size={16} /> : <Play size={16} fill="currentColor" />}
          {previewing ? '生成中' : '生成预览'}
        </button>
      </div>

      <section className={`transcript-output ${preview ? 'has-output' : ''}`} aria-live="polite">
        <div className="output-meta">
          <span><Radio size={14} /> LIVE OUTPUT</span>
        </div>
        <p>
          {preview?.text || '点击生成，查看当前编排的完整文字。'}
        </p>
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

      <div className="sequence-heading">
        <span>SEQUENCE</span>
        <span>{blocks.filter((block) => block.enabled).length} ACTIVE / {blocks.length} TOTAL</span>
      </div>

      {blocks.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((block) => block.id)} strategy={rectSortingStrategy}>
            <div className="block-list">
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
          <span>播报稿为空</span>
        </div>
      )}
    </aside>
  )
}
