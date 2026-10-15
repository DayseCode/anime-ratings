import { useEffect, useRef, useState } from 'react'

export default function OnlineButton({ online, myKey }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const users = online.filter((o) => o.user).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const guests = online.length - users.length

  return (
    <div className="online" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} title="Who is online">
        <span className="dot" /> {online.length} online
      </button>
      {open && (
        <div className="online-pop">
          <div className="online-title">Online now</div>
          {users.map((u) => (
            <div key={u.key} className="online-row">
              <span className="dot" /> {u.name || 'user'}
              {u.key === myKey && <span className="muted"> (you)</span>}
            </div>
          ))}
          {guests > 0 && (
            <div className="online-row muted">
              <span className="dot grey" /> {guests} guest{guests > 1 ? 's' : ''} (not logged in)
            </div>
          )}
          {online.length === 0 && <div className="online-row muted">Nobody yet…</div>}
        </div>
      )}
    </div>
  )
}
