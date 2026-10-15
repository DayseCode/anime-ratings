import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { BADGE, KINDS, isYoutube } from '../utils.js'

/* ---------------- Songs tab: add form (left) + search/delete (right) ---------------- */
function SongsTab({ data, onAdd, onDelete }) {
  const [kind, setKind] = useState('OP')
  const [f, setF] = useState({ title: '', yt: '', vlink: '', author: '', song: '', url: '' })
  const [query, setQuery] = useState('')
  const [msg, setMsg] = useState(null) // {type:'ok'|'error', text}
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const isInsert = kind === 'INSERT'

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = [...data.OP, ...data.ED, ...data.INSERT]
    const list = q
      ? all.filter((s) => [s.title, s.author, s.song].some((x) => (x || '').toLowerCase().includes(q)))
      : [...all].sort((a, b) => b.id - a.id) // newest first when search is empty
    return list.slice(0, 80)
  }, [query, data])

  async function submit(e) {
    e.preventDefault()
    setMsg(null)
    const title = f.title.trim()
    if (!title) return setMsg({ type: 'error', text: 'Name is required.' })

    let row
    if (isInsert) {
      const u = f.url.trim() || null
      row = {
        kind, title,
        author: f.author.trim() || null,
        song: f.song.trim() || null,
        youtube_url: isYoutube(u) ? u : null,
        vlink_url: isYoutube(u) ? null : u,
      }
    } else {
      row = { kind, title, youtube_url: f.yt.trim() || null, vlink_url: f.vlink.trim() || null }
    }

    const dup = data[kind].find(
      (s) => s.title.toLowerCase() === title.toLowerCase() && (s.song || '').toLowerCase() === (row.song || '').toLowerCase()
    )
    if (dup && !confirm(`"${title}" already exists in this tab. Add anyway?`)) return

    setBusy(true)
    const err = await onAdd(row)
    setBusy(false)
    if (err) return setMsg({ type: 'error', text: err })
    setMsg({ type: 'ok', text: `Added "${title}"` })
    setF({ title: '', yt: '', vlink: '', author: '', song: '', url: '' })
  }

  return (
    <div className="admin-grid">
      <form onSubmit={submit} className="admin-left">
        <label>{isInsert ? 'Anime title:' : 'Anime name:'}</label>
        <input value={f.title} onChange={set('title')} placeholder={isInsert ? 'Bleach' : 'Bleach [OP]/[ED]'} />

        {isInsert ? (
          <>
            <label>Author:</label>
            <input value={f.author} onChange={set('author')} placeholder="Artist" />
            <label>Song:</label>
            <input value={f.song} onChange={set('song')} placeholder="Song name" />
            <label>URL:</label>
            <input value={f.url} onChange={set('url')} placeholder="https://..." />
          </>
        ) : (
          <>
            <label>YouTube Link (URL):</label>
            <input value={f.yt} onChange={set('yt')} placeholder="https://youtube.com/..." />
            <label>Additional Link (VLINK):</label>
            <input value={f.vlink} onChange={set('vlink')} placeholder="https://..." />
          </>
        )}

        <label>Type:</label>
        <div className="radios">
          {KINDS.map((k) => (
            <label key={k.key} className="radio">
              <input type="radio" name="kind" checked={kind === k.key} onChange={() => setKind(k.key)} /> {k.single}
            </label>
          ))}
        </div>

        {msg && <p className={msg.type === 'ok' ? 'ok' : 'error'}>{msg.text}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Adding...' : 'Add'}</button>
      </form>

      <div className="admin-right">
        <label>Search for anime name:</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bleach" autoFocus />
        <ul className="results">
          {results.map((s) => (
            <li key={s.id}>
              <span className={`badge ${s.kind}`}>{BADGE[s.kind]}</span>
              <span className="r-title">
                <b>{s.title}</b>
                {s.kind === 'INSERT' && <em> — {s.author} · {s.song}</em>}
                <small> (id {s.id})</small>
              </span>
              <button className="icon-btn" title="Delete" onClick={() => onDelete(s)}>🗑</button>
            </li>
          ))}
          {results.length === 0 && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  )
}

/* ---------------- Users tab: link accounts to columns, make admins ---------------- */
function UsersTab({ raters, reloadRaters, currentUserId }) {
  const [profiles, setProfiles] = useState([])
  const [err, setErr] = useState('')

  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at')
    if (error) setErr(error.message)
    else setProfiles(data)
  }
  useEffect(() => { load() }, [])

  const linked = (uid) => raters.find((r) => r.user_id === uid)

  async function link(profile, raterId) {
    setErr('')
    let r = await supabase.from('raters').update({ user_id: null }).eq('user_id', profile.id)
    if (!r.error && raterId) r = await supabase.from('raters').update({ user_id: profile.id }).eq('id', raterId)
    if (r.error) setErr(r.error.message)
    await reloadRaters()
  }

  async function createColumn(profile) {
    setErr('')
    const name = (profile.username || profile.email.split('@')[0]).trim()
    await supabase.from('raters').update({ user_id: null }).eq('user_id', profile.id)
    const position = Math.max(-1, ...raters.map((r) => r.position)) + 1
    const { error } = await supabase.from('raters').insert({ name, position, user_id: profile.id })
    if (error) setErr(error.message)
    await reloadRaters()
  }

  async function toggleAdmin(profile) {
    const { error } = await supabase.from('profiles').update({ is_admin: !profile.is_admin }).eq('id', profile.id)
    if (error) setErr(error.message)
    await load()
  }

  return (
    <div className="users-tab">
      <p className="muted">
        New accounts appear here. Link each one to a rating column (an existing one, or create a new column).
        Admins can edit everything.
      </p>
      {err && <p className="error">{err}</p>}
      <div className="table-wrap users-wrap">
        <table className="users">
          <thead>
            <tr><th>Email</th><th>Name</th><th>Rating column</th><th>Admin</th></tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const mine = linked(p.id)
              return (
                <tr key={p.id}>
                  <td>{p.email}</td>
                  <td>{p.username}</td>
                  <td>
                    <select value={mine?.id ?? ''} onChange={(e) => link(p, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— not linked —</option>
                      {raters.map((r) => (
                        <option key={r.id} value={r.id} disabled={r.user_id && r.user_id !== p.id}>
                          {r.name}{r.user_id && r.user_id !== p.id ? ' (taken)' : ''}
                        </option>
                      ))}
                    </select>{' '}
                    {!mine && <button className="btn small" onClick={() => createColumn(p)}>+ new column</button>}
                  </td>
                  <td>
                    <input type="checkbox" checked={p.is_admin} disabled={p.id === currentUserId} onChange={() => toggleAdmin(p)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AdminModal({ data, raters, reloadRaters, onAdd, onDelete, onClose, currentUserId }) {
  const [tab, setTab] = useState('songs')
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>Admin panel</h2>
        <div className="subtabs">
          <button className={tab === 'songs' ? 'on' : ''} onClick={() => setTab('songs')}>Add / remove songs</button>
          <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users</button>
        </div>
        {tab === 'songs' ? (
          <SongsTab data={data} onAdd={onAdd} onDelete={onDelete} />
        ) : (
          <UsersTab raters={raters} reloadRaters={reloadRaters} currentUserId={currentUserId} />
        )}
      </div>
    </div>
  )
}
