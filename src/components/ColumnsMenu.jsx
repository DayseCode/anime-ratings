import { useEffect, useRef, useState } from 'react'

/* "Columns (10/23)" dropdown: tick to show/hide, drag the ≡ handle to reorder.
   Works with mouse and touch. The choice is saved in this browser only. */
export default function ColumnsMenu({ items, hidden, onToggle, onMove, onReset }) {
  const [open, setOpen] = useState(false)
  const [dragKey, setDragKey] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const shown = items.filter((i) => !hidden.has(i.key)).length

  function startDrag(e, key) {
    e.preventDefault()
    setDragKey(key)
    const move = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-colkey]')
      const over = el?.dataset.colkey
      if (over && over !== key) onMove(key, over)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDragKey(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div className="cols" ref={ref}>
      <button className={`btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        Columns ({shown}/{items.length})
      </button>
      {open && (
        <div className="cols-pop">
          <div className="cols-actions">
            <button className="btn small" onClick={onReset}>Reset</button>
          </div>
          {items.map((it) => (
            <div key={it.key} data-colkey={it.key} className={`cols-row ${dragKey === it.key ? 'dragging' : ''}`}>
              <label>
                <input type="checkbox" checked={!hidden.has(it.key)} onChange={() => onToggle(it.key)} />
                <span>{it.label}</span>
                {it.mine && <span className="chip">you</span>}
              </label>
              <span className="grip" title="Drag to reorder" onPointerDown={(e) => startDrag(e, it.key)}>≡</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
