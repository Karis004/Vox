import { useEffect, useRef, type ReactNode, type PointerEvent, type MouseEvent } from 'react'
import { X } from 'lucide-react'

export function DialogFrame({ title, className, onClose, children }: {
  title: string; className: string; onClose: () => void; children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const startedOutside = useRef(false)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])

  function outside(event: PointerEvent<HTMLDialogElement> | MouseEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
  }

  return <dialog ref={dialog} className={`app-dialog ${className}`} aria-label={title} onCancel={onClose}
    onPointerDown={event => { startedOutside.current = event.target === event.currentTarget && outside(event) }}
    onClick={event => { if (startedOutside.current && event.target === event.currentTarget && outside(event)) onClose() }}>
    <div className="dialog-heading"><strong>{title}</strong><button className="icon-button" aria-label={`关闭${title}`} onClick={onClose}><X size={17} /></button></div>
    <div className="dialog-body">{children}</div>
  </dialog>
}
