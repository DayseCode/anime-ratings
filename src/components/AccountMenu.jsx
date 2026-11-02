import { useEffect, useRef, useState } from 'react'
import { SKINS } from '../skins.js'

/* One compact "avatar + name" button instead of nick + column + role + 2 buttons.
   Click it for the details, the Admin panel and Log out. */
export default function AccountMenu({ session, name, email, columnName, isAdmin, videoSource, onVideoSource, autoNext, onAutoNext, blind, blindAvailable, onBlind, onTaste, skin, onSkin, onAdmin, onLogin, onLogout }) {
  const [open, setOpen] = useState(false)
  const [skinOpen, setSkinOpen] = useState(false)
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
              <button className={videoSource === 'a' ? 'on' : ''} onClick={() => onVideoSource('a')}>ADB</button>
            </div>
          </div>
          <div className="acct-pref">
            <span>Auto-play next song</span>
            <div className="seg" role="group" aria-label="Auto-play next song">
              <button className={!autoNext ? 'on' : ''} onClick={() => onAutoNext(false)}>Off</button>
              <button className={autoNext ? 'on' : ''} onClick={() => onAutoNext(true)}>On</button>
            </div>
          </div>
          <div className="acct-pref">
            <span>Blind mode{blindAvailable ? '' : ' (needs a linked column)'}</span>
            <div className="seg" role="group" aria-label="Blind mode">
              <button className={!blind ? 'on' : ''} onClick={() => onBlind(false)}>Off</button>
              <button className={blind ? 'on' : ''} onClick={() => onBlind(true)}>On</button>
            </div>
          </div>
          <div className="acct-pref">
            <span>Colour theme</span>
            {(() => {
              const cur = SKINS.find((k) => k.id === skin) || SKINS[0]
              const dots = (k) => (
                <span className="skin-dots" aria-hidden="true">
                  {k.dots.map((c) => <i key={c} style={{ background: c }} />)}
                </span>
              )
              return (
                <div className="skin-drop">
                  <button className="skin-opt skin-cur" onClick={() => setSkinOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={skinOpen}>
                    {dots(cur)}
                    <span className="skin-cur-name">{cur.name}</span>
                    <span className="caret">{skinOpen ? '▴' : '▾'}</span>
                  </button>
                  {skinOpen && (
                    <div className="skin-list" role="listbox" aria-label="Colour theme">
                      {SKINS.map((k) => (
                        <button
                          key={k.id}
                          role="option"
                          aria-selected={skin === k.id}
                          className={`skin-opt ${skin === k.id ? 'on' : ''}`}
                          onClick={() => { setSkinOpen(false); onSkin(k.id) }}
                        >
                          {dots(k)}
                          {k.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
          <button className="btn" onClick={run(onTaste)}>Taste match</button>
          {isAdmin && <button className="btn" onClick={run(onAdmin)}>Admin panel</button>}
          <button className="btn" onClick={run(onLogout)}>Log out</button>
        </div>
      )}
    </div>
  )
}
