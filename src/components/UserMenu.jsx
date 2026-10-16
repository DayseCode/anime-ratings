import { useEffect, useRef, useState } from 'react'

/* Phone-only "☰" menu: account info, Admin panel, Log in / Log out.
   (On desktop these buttons are shown directly in the header and this is hidden.) */
export default function UserMenu({ session, name, columnName, isAdmin, onAdmin, onLogin, onLogout }) {
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

  const run = (fn) => () => { setOpen(false); fn() }

  return (
    <div className="mob-only usermenu" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
      {open && (
        <div className="pop-sheet">
          {session ? (
            <>
              <div className="um-name">
                <span>{name}</span>
                {columnName && <span className="chip">{columnName}</span>}
                {isAdmin && <span className="chip admin">admin</span>}
              </div>
              {isAdmin && <button className="btn" onClick={run(onAdmin)}>⚙ Admin panel</button>}
              <button className="btn" onClick={run(onLogout)}>Log out</button>
            </>
          ) : (
            <button className="btn primary" onClick={run(onLogin)}>Log in / Sign up</button>
          )}
        </div>
      )}
    </div>
  )
}
