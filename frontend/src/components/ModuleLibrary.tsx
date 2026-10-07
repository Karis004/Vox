import { Plus } from 'lucide-react'
import { blockIcons, blockLabels } from '../icons'
import type { CatalogItem } from '../types'

interface ModuleLibraryProps {
  catalog: CatalogItem[]
  onAdd: (item: CatalogItem) => void
}

export function ModuleLibrary({ catalog, onAdd }: ModuleLibraryProps) {
  return (
    <aside className="library panel-region" aria-label="模块库">
      <div className="region-heading">
        <span className="kicker">LIBRARY</span>
        <span className="count-mark">{String(catalog.length).padStart(2, '0')}</span>
      </div>
      <div className="library-list">
        {catalog.map((item) => {
          const Icon = blockIcons[item.type]
          return (
            <button
              className="library-item"
              key={item.type}
              onClick={() => onAdd(item)}
              title={`添加${item.name}`}
            >
              <span className={`module-icon type-${item.type}`}>
                <Icon size={17} strokeWidth={1.8} />
              </span>
              <span className="library-copy">
                <span>{item.name}</span>
                <small>{blockLabels[item.type]}</small>
              </span>
              <Plus size={16} aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </aside>
  )
}
