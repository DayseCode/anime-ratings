import { useEffect, useRef, useState } from 'react'

/* One compact "avatar + name" button instead of nick + column + role + 2 buttons.
   Click it for the details, the Admin panel and Log out. */
export default function AccountMenu({ session, name, email, columnName, isAdmin, videoSource, onVideoSource, onAdmin, onLogin, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [open])

  if (!session) return <button className="btn primary" onClick={onLogin}>Log in</button>

  const label = columnName || name || email?.split('@')[0] || '?'
  const initial = label.trim().charAt(0) || '?'
  const run = (fn) => () => { setOpen(false); fn() }

  return (
    <div className="acct" ref={ref}>
      <button className="acct-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={isAdmin ? `${label} (admin)` : label}>
        <span className={`avatar ${isAdmin ? 'admin' : ''}`}>{initial}</span>
        <span className="acct-name">{label}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="acct-pop">
          <div className="acct-head">
            <span className={`avatar big ${isAdmin ? 'admin' : ''}`}>{initial}</span>
            <div className="acct-meta">
              <b>{name || label}</b>
              <small>{email}</small>
            </div>
          </div>
          <dl className="acct-rows">
            <div><dt>Column</dt><dd>{columnName || 'not linked yet'}</dd></div>
            <div><dt>Role</dt><dd>{isAdmin ? <span className="chip admin">admin</span> : 'member'}</dd></div>
          </dl>
          <div className="acct-pref">
            <span>Preferred video source</span>
            <div className="seg" role="group" aria-label="Preferred video source">
              <button className={videoSource === 'yt' ? 'on' : ''} onClick={() => onVideoSource('yt')}>YouTube</button>
              <button className={videoSource === 'v' ? 'on' : ''} onClick={() => onVideoSource('v')}>VLINK</button>
            </div>
          </div>
          {isAdmin && <button className="btn" onClick={run(onAdmin)}>Admin panel</button>}
          <button className="btn" onClick={run(onLogout)}>Log out</button>
        </div>
      )}
    </div>
  )
}
