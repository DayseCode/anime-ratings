import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { configured, supabase } from './supabase.js'
import { KINDS, SONG_COLUMNS, fetchAllSongs, normalizeSong, stats } from './utils.js'
import SongTable from './components/SongTable.jsx'
import AuthModal from './components/AuthModal.jsx'
import AdminModal from './components/AdminModal.jsx'
import EditSongModal from './components/EditSongModal.jsx'
import OnlineButton from './components/OnlineButton.jsx'
import LogsPage from './components/LogsPage.jsx'
import Player from './components/Player.jsx'

const PAGE = 200

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [raters, setRaters] = useState([])
  const [data, setData] = useState({ OP: [], ED: [], INSERT: [] })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('songs') // 'songs' | 'logs'
  const [tab, setTab] = useState('OP')
  const [search, setSearch] = useState('')
  const [onlyUnrated, setOnlyUnrated] = useState(false)
  const [sort, setSort] = useState({ key: null, dir: 'desc' }) // user-side only, never saved
  const [showAll, setShowAll] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [editing, setEditing] = useState(null)
  const [track, setTrack] = useState(null) // what the player is playing
  const [online, setOnline] = useState([])
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()
  const headRef = useRef(null)

  const notify = useCallback((text, type = 'error') => {
    setToast({ text, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  /* ---------- layout helpers: sticky header height + visible width ---------- */
  useEffect(() => {
    const root = document.documentElement
    const setVw = () => root.style.setProperty('--vw', `${root.clientWidth}px`)
    setVw()
    window.addEventListener('resize', setVw)
    const ro = new ResizeObserver(setVw)
    ro.observe(root)
    let ro2
    if (headRef.current) {
      const setH = () => root.style.setProperty('--head-h', `${headRef.current.offsetHeight}px`)
      setH()
      ro2 = new ResizeObserver(setH)
      ro2.observe(headRef.current)
    }
    return () => {
      window.removeEventListener('resize', setVw)
      ro.disconnect()
      ro2?.disconnect()
    }
  }, [])

  /* ---------- auth ---------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!userId) return setProfile(null)
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then(({ data }) => setProfile(data))
  }, [userId])

  const isAdmin = Boolean(profile?.is_admin)

  /* ---------- load data ---------- */
  const reloadRaters = useCallback(async () => {
    const { data, error } = await supabase.from('raters').select('*').order('position').order('id')
    if (error) notify(error.message)
    else setRaters(data)
  }, [notify])

  const reloadKind = useCallback(async (kind) => {
    try {
      const songs = await fetchAllSongs(supabase, kind)
      setData((d) => ({ ...d, [kind]: songs }))
    } catch (e) {
      notify(e.message)
    }
  }, [notify])

  useEffect(() => {
    if (!configured) return setLoading(false)
    Promise.all([reloadRaters(), ...KINDS.map((k) => reloadKind(k.key))]).then(() => setLoading(false))
  }, [reloadRaters, reloadKind])

  const myRater = useMemo(() => raters.find((r) => r.user_id === userId) ?? null, [raters, userId])
  const myRaterId = myRater?.id ?? null

  /* ---------- who is online (Supabase Realtime presence) ---------- */
  const presenceName = myRater?.name || profile?.username || session?.user?.email?.split('@')[0] || null
  const guestKey = useRef(null)
  if (!guestKey.current) guestKey.current = crypto.randomUUID ? crypto.randomUUID() : String(Math.random())
  const chRef = useRef(null)
  const readyRef = useRef(false)
  const nameRef = useRef(null)
  nameRef.current = presenceName

  useEffect(() => {
    if (!configured) return
    const key = userId ?? guestKey.current
    const ch = supabase.channel('online-users', { config: { presence: { key } } })
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState()
      setOnline(Object.entries(st).map(([k, metas]) => ({ key: k, ...(metas[metas.length - 1] || {}) })))
    })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        readyRef.current = true
        ch.track({ name: nameRef.current, user: Boolean(userId) })
      }
    })
    chRef.current = ch
    return () => {
      readyRef.current = false
      chRef.current = null
      supabase.removeChannel(ch)
    }
  }, [userId])

  useEffect(() => {
    if (readyRef.current) chRef.current?.track({ name: presenceName, user: Boolean(userId) })
  }, [presenceName, userId])

  /* ---------- actions ---------- */
  const saveScore = useCallback(
    async (songId, raterId, value) => {
      setData((d) => ({
        ...d,
        [tab]: d[tab].map((s) => {
          if (s.id !== songId) return s
          const scores = { ...s.scores }
          if (value == null) delete scores[raterId]
          else scores[raterId] = value
          return { ...s, scores, ...stats(scores) }
        }),
      }))
      const { error } =
        value == null
          ? await supabase.from('scores').delete().eq('song_id', songId).eq('rater_id', raterId)
          : await supabase
              .from('scores')
              .upsert({ song_id: songId, rater_id: raterId, score: value, updated_at: new Date().toISOString() }, { onConflict: 'song_id,rater_id' })
      if (error) {
        notify(`Not saved: ${error.message}`)
        reloadKind(tab)
      }
    },
    [tab, notify, reloadKind]
  )

  // returns true when the song was deleted
  const deleteSong = useCallback(
    async (song) => {
      if (!confirm(`Delete "${song.title}${song.song ? ' – ' + song.song : ''}" and all its scores?`)) return false
      const { error } = await supabase.from('songs').delete().eq('id', song.id)
      if (error) {
        notify(error.message)
        return false
      }
      setData((d) => ({ ...d, [song.kind]: d[song.kind].filter((s) => s.id !== song.id) }))
      setTrack((t) => (t && t.song.id === song.id ? null : t))
      notify('Deleted', 'ok')
      return true
    },
    [notify]
  )

  const addSong = useCallback(async (row) => {
    const { data: created, error } = await supabase.from('songs').insert(row).select(SONG_COLUMNS).single()
    if (error) return error.message
    setData((d) => ({ ...d, [row.kind]: [...d[row.kind], normalizeSong(created)] }))
    return null
  }, [])

  // returns an error message or null
  const updateSong = useCallback(async (id, patch) => {
    const { data: u, error } = await supabase.from('songs').update(patch).eq('id', id).select(SONG_COLUMNS).single()
    if (error) return error.message
    setData((d) => ({ ...d, [u.kind]: d[u.kind].map((s) => (s.id === id ? { ...s, ...u } : s)) }))
    return null
  }, [])

  const openEdit = useCallback((song) => setEditing(song), [])

  /* ---------- sort (local to this browser) ---------- */
  const onSort = useCallback((key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: ['title', 'author', 'song'].includes(key) ? 'asc' : 'desc' }))
  }, [])

  const rows = useMemo(() => {
    let list = data[tab]
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((s) => [s.title, s.author, s.song].some((x) => (x || '').toLowerCase().includes(q)))
    if (onlyUnrated && myRaterId) list = list.filter((s) => s.scores[myRaterId] == null)
    if (sort.key) {
      const mul = sort.dir === 'asc' ? 1 : -1
      const val = (s) => {
        if (sort.key === 'avg') return s.avg
        if (sort.key.startsWith('r:')) return s.scores[sort.key.slice(2)] ?? null
        return (s[sort.key] ?? '').toString().toLowerCase()
      }
      list = [...list].sort((a, b) => {
        const x = val(a), y = val(b)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        return (x < y ? -1 : x > y ? 1 : 0) * mul
      })
    }
    return list
  }, [data, tab, search, onlyUnrated, myRaterId, sort])

  useEffect(() => setShowAll(false), [tab, search, onlyUnrated, sort])

  /* ---------- player ---------- */
  const rowsRef = useRef([])
  rowsRef.current = rows

  const playSong = useCallback((song) => {
    setTrack({ song, src: song.youtube_url ? 'yt' : 'v' })
  }, [])

  const step = useCallback((dir) => {
    setTrack((t) => {
      if (!t) return t
      const list = rowsRef.current.filter((s) => s.youtube_url || s.vlink_url)
      const i = list.findIndex((s) => s.id === t.song.id)
      const next = i === -1 ? list[dir > 0 ? 0 : list.length - 1] : list[i + dir]
      return next ? { song: next, src: next.youtube_url ? 'yt' : 'v' } : t
    })
  }, [])
  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => step(-1), [step])
  const setSource = useCallback((src) => setTrack((t) => (t ? { ...t, src } : t)), [])
  const closePlayer = useCallback(() => setTrack(null), [])

  /* ---------- render ---------- */
  if (!configured) {
    return (
      <div className="center-msg">
        <h2>Supabase is not configured</h2>
        <p>Create <code>.env.local</code> with <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (locally),
        or add them as Environment Variables in Vercel, then restart / redeploy.</p>
      </div>
    )
  }

  const displayName = profile?.username || session?.user?.email
  const onLogs = view === 'logs' && isAdmin
  const visible = showAll ? rows : rows.slice(0, PAGE)

  return (
    <div className="app">
      <div className="sticky-head" ref={headRef}>
        <header className="topbar">
          <nav className="tabs">
            {KINDS.map((k) => (
              <button key={k.key} className={!onLogs && tab === k.key ? 'on' : ''} onClick={() => { setTab(k.key); setView('songs') }}>
                {k.label} <span className="count">{data[k.key].length}</span>
              </button>
            ))}
            {isAdmin && (
              <button className={onLogs ? 'on' : ''} onClick={() => setView('logs')}>Logs</button>
            )}
          </nav>
          <div className="user-area">
            <OnlineButton online={online} myKey={userId ?? guestKey.current} />
            {session ? (
              <>
                <span className="who">
                  {displayName}
                  {myRater && <span className="chip">{myRater.name}</span>}
                  {isAdmin && <span className="chip admin">admin</span>}
                </span>
                {isAdmin && <button className="btn" onClick={() => setShowAdmin(true)}>⚙ Admin panel</button>}
                <button className="btn" onClick={() => supabase.auth.signOut()}>Log out</button>
              </>
            ) : (
              <button className="btn primary" onClick={() => setShowAuth(true)}>Log in / Sign up</button>
            )}
          </div>
        </header>

        {!onLogs && session && profile && !myRater && !isAdmin && (
          <div className="banner">
            Your account isn’t linked to a rating column yet. Ask an admin to link you — then you can click your own column to add scores.
          </div>
        )}
        {!onLogs && !session && <div className="banner soft">Log in to add your own scores. Click any column header to sort (only for you).</div>}

        {!onLogs && (
          <div className="toolbar">
            <input className="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {myRaterId && (
              <label className="check">
                <input type="checkbox" checked={onlyUnrated} onChange={(e) => setOnlyUnrated(e.target.checked)} /> Only songs I haven’t rated
              </label>
            )}
            {sort.key && <button className="btn small" onClick={() => setSort({ key: null, dir: 'desc' })}>Reset sort</button>}
            <span className="muted">{rows.length} shown</span>
          </div>
        )}
      </div>

      {onLogs ? (
        <LogsPage />
      ) : loading ? (
        <div className="center-msg vw">Loading…</div>
      ) : (
        <>
          <SongTable
            songs={visible}
            kind={tab}
            raters={raters}
            myRaterId={myRaterId}
            isAdmin={isAdmin}
            playingId={track?.song.id}
            sort={sort}
            onSort={onSort}
            onSave={saveScore}
            onEdit={openEdit}
            onPlay={playSong}
          />
          {!showAll && rows.length > PAGE && (
            <div className="more vw">
              <button className="btn" onClick={() => setShowAll(true)}>Show all {rows.length}</button>
            </div>
          )}
        </>
      )}

      {track && <Player track={track} onClose={closePlayer} onNext={next} onPrev={prev} onSource={setSource} />}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showAdmin && isAdmin && (
        <AdminModal
          data={data}
          raters={raters}
          reloadRaters={reloadRaters}
          onAdd={addSong}
          onEdit={openEdit}
          onClose={() => setShowAdmin(false)}
          currentUserId={userId}
        />
      )}
      {editing && isAdmin && (
        <EditSongModal song={editing} onSave={updateSong} onDelete={deleteSong} onClose={() => setEditing(null)} />
      )}
      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
    </div>
  )
}
