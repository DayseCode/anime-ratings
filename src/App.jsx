import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { configured, supabase } from './supabase.js'
import { KINDS, SONG_COLUMNS, fetchAllSongs, normalizeSong, stats } from './utils.js'
import SongTable from './components/SongTable.jsx'
import AuthModal from './components/AuthModal.jsx'
import AdminModal from './components/AdminModal.jsx'

const PAGE = 200

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [raters, setRaters] = useState([])
  const [data, setData] = useState({ OP: [], ED: [], INSERT: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('OP')
  const [search, setSearch] = useState('')
  const [onlyUnrated, setOnlyUnrated] = useState(false)
  const [sort, setSort] = useState({ key: null, dir: 'desc' }) // user-side only, never saved
  const [limit, setLimit] = useState(PAGE)
  const [showAuth, setShowAuth] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()

  const notify = useCallback((text, type = 'error') => {
    setToast({ text, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
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

  /* ---------- actions ---------- */
  const saveScore = useCallback(
    async (songId, raterId, value) => {
      // optimistic update
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
        reloadKind(tab) // revert to what the database really has
      }
    },
    [tab, notify, reloadKind]
  )

  const deleteSong = useCallback(
    async (song) => {
      if (!confirm(`Delete "${song.title}${song.song ? ' – ' + song.song : ''}" and all its scores?`)) return
      const { error } = await supabase.from('songs').delete().eq('id', song.id)
      if (error) return notify(error.message)
      setData((d) => ({ ...d, [song.kind]: d[song.kind].filter((s) => s.id !== song.id) }))
      notify('Deleted', 'ok')
    },
    [notify]
  )

  const addSong = useCallback(async (row) => {
    const { data: created, error } = await supabase.from('songs').insert(row).select(SONG_COLUMNS).single()
    if (error) return error.message
    setData((d) => ({ ...d, [row.kind]: [...d[row.kind], normalizeSong(created)] }))
    return null
  }, [])

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
        if (x == null) return 1 // empty cells always at the bottom
        if (y == null) return -1
        return (x < y ? -1 : x > y ? 1 : 0) * mul
      })
    }
    return list
  }, [data, tab, search, onlyUnrated, myRaterId, sort])

  useEffect(() => setLimit(PAGE), [tab, search, onlyUnrated, sort])

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

  return (
    <div className="app">
      <header className="topbar">
        <h1>Anime Songs Ratings</h1>
        <div className="user-area">
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

      {session && profile && !myRater && !isAdmin && (
        <div className="banner">
          Your account isn’t linked to a rating column yet. Ask an admin to link you — then you can click your own column to add scores.
        </div>
      )}
      {!session && <div className="banner soft">Log in to add your own scores. Click any column header to sort (only for you).</div>}

      <nav className="tabs">
        {KINDS.map((k) => (
          <button key={k.key} className={tab === k.key ? 'on' : ''} onClick={() => setTab(k.key)}>
            {k.label} <span className="count">{data[k.key].length}</span>
          </button>
        ))}
      </nav>

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

      {loading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <>
          <SongTable
            songs={rows.slice(0, limit)}
            kind={tab}
            raters={raters}
            myRaterId={myRaterId}
            isAdmin={isAdmin}
            sort={sort}
            onSort={onSort}
            onSave={saveScore}
            onDelete={deleteSong}
          />
          {rows.length > limit && (
            <div className="more">
              <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button>
              <button className="btn" onClick={() => setLimit(rows.length)}>Show all</button>
            </div>
          )}
        </>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showAdmin && isAdmin && (
        <AdminModal
          data={data}
          raters={raters}
          reloadRaters={reloadRaters}
          onAdd={addSong}
          onDelete={deleteSong}
          onClose={() => setShowAdmin(false)}
          currentUserId={userId}
        />
      )}
      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
    </div>
  )
}
