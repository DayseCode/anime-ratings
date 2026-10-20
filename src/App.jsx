import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { configured, supabase } from './supabase.js'
import { KINDS, SONG_COLUMNS, applyScoreChanges, applySongEvent, compareText, fetchAllSongs, normalizeSong, pickSource, stats } from './utils.js'
import SongTable from './components/SongTable.jsx'
import AuthModal from './components/AuthModal.jsx'
import AdminModal from './components/AdminModal.jsx'
import EditSongModal from './components/EditSongModal.jsx'
import OnlineButton from './components/OnlineButton.jsx'
import LogsPage from './components/LogsPage.jsx'
import Player from './components/Player.jsx'
import ColumnsMenu from './components/ColumnsMenu.jsx'
import AccountMenu from './components/AccountMenu.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { applySkin, isSkin } from './skins.js'

const PAGE = 200
const DEFAULT_SORT = { key: 'title', dir: 'asc' } // A-Z by name, "OP2" before "OP10"

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
  const [sort, setSort] = useState(DEFAULT_SORT) // user-side only, never saved
  const [showAll, setShowAll] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [editing, setEditing] = useState(null)
  const [track, setTrack] = useState(null) // what the player is playing
  const [online, setOnline] = useState([])
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()

  /* ---------- theme (dark / light), remembered in this browser ---------- */
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
  }, [theme])
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  /* ---------- colour theme / skin (Sakura, Neon Party, ...): remembered here and saved in the account ---------- */
  const [skin, setSkin] = useState(() => document.documentElement.dataset.skin || 'sakura')
  const metaSkin = session?.user?.user_metadata?.skin
  useEffect(() => {
    // after login, the skin saved in the account wins (so it follows you to every device)
    if (isSkin(metaSkin)) {
      setSkin(metaSkin)
      applySkin(metaSkin)
      try { localStorage.setItem('skin', metaSkin) } catch { /* ignore */ }
    }
  }, [metaSkin])
  const skinRef = useRef(skin)
  skinRef.current = skin
  const changeSkin = useCallback(
    async (id) => {
      if (!isSkin(id) || id === skinRef.current) return
      setSkin(id)
      applySkin(id)
      try { localStorage.setItem('skin', id) } catch { /* ignore */ }
      const { error } = await supabase.auth.updateUser({ data: { skin: id } })
      if (error) notify(`Saved on this device only: ${error.message}`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const headRef = useRef(null)
  const recentLocal = useRef(new Map()) // my own recent edits (to ignore their echo)
  const pendingLive = useRef([]) // score changes from other people, applied once per second
  const liveTimer = useRef(null)

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

  /* ---------- live scores from other people (Supabase Realtime) ---------- */
  useEffect(() => {
    if (!configured) return
    const flush = () => {
      liveTimer.current = null
      const batch = pendingLive.current
      pendingLive.current = []
      if (batch.length) setData((d) => applyScoreChanges(d, batch))
    }
    const ch = supabase
      .channel('scores-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, (p) => {
        const row = p.eventType === 'DELETE' ? p.old : p.new
        if (!row || row.song_id == null || row.rater_id == null) return
        const value = p.eventType === 'DELETE' ? null : Number(row.score)
        const mine = recentLocal.current.get(`${row.song_id}:${row.rater_id}`)
        if (mine && Date.now() - mine.t < 10000 && mine.value === value) return // echo of my own edit
        pendingLive.current.push({ songId: row.song_id, raterId: row.rater_id, value })
        if (!liveTimer.current) liveTimer.current = setTimeout(flush, 1000) // batch: at most 1 update / second
      })
      // songs added / edited / deleted by an admin
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, (p) => {
        setData((d) => applySongEvent(d, p))
        if (p.eventType === 'DELETE') setTrack((t) => (t && t.song.id === p.old?.id ? null : t))
      })
      .subscribe()

    // phones put the connection to sleep in the background: catch up when the tab comes back
    let hiddenAt = 0
    const onVisible = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 30000) KINDS.forEach((k) => reloadKind(k.key))
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(liveTimer.current)
      liveTimer.current = null
      supabase.removeChannel(ch)
    }
  }, [reloadKind])

  const myRater = useMemo(() => (userId ? raters.find((r) => r.user_id === userId) ?? null : null), [raters, userId])
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
    async (songId, raterId, value, kind = tab) => {
      // guests and users without their own column can never write anything
      if (!userId || (!isAdmin && raterId !== myRaterId)) return
      recentLocal.current.set(`${songId}:${raterId}`, { value: value ?? null, t: Date.now() })
      setData((d) => ({
        ...d,
        [kind]: d[kind].map((s) => {
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
        reloadKind(kind)
      }
    },
    [tab, notify, reloadKind, userId, isAdmin, myRaterId]
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

  /* ---------- column visibility / order (saved in this browser only) ---------- */
  const [colCfg, setColCfg] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem('table.columns.v1'))
      return { order: c?.order ?? [], hidden: c?.hidden ?? [] }
    } catch {
      return { order: [], hidden: [] }
    }
  })
  useEffect(() => {
    try { localStorage.setItem('table.columns.v1', JSON.stringify(colCfg)) } catch { /* ignore */ }
  }, [colCfg])

  const raterById = useMemo(() => Object.fromEntries(raters.map((r) => [r.id, r])), [raters])
  const orderedKeys = useMemo(() => {
    const master = ['author', 'song', 'avg', ...raters.map((r) => `r:${r.id}`)]
    const valid = new Set(master)
    const saved = colCfg.order.filter((k) => valid.has(k))
    return [...saved, ...master.filter((k) => !saved.includes(k))]
  }, [raters, colCfg.order])
  const hiddenSet = useMemo(() => new Set(colCfg.hidden), [colCfg.hidden])
  const menuItems = useMemo(
    () =>
      orderedKeys
        .filter((k) => tab === 'INSERT' || (k !== 'author' && k !== 'song'))
        .map((k) => ({
          key: k,
          label: k === 'author' ? 'Author' : k === 'song' ? 'Song' : k === 'avg' ? 'Avg' : raterById[k.slice(2)]?.name ?? k,
          mine: myRaterId != null && k === `r:${myRaterId}`,
        })),
    [orderedKeys, tab, raterById, myRaterId]
  )
  const columns = useMemo(() => menuItems.filter((i) => !hiddenSet.has(i.key)).map((i) => i.key), [menuItems, hiddenSet])

  const toggleColumn = useCallback((key) => {
    setColCfg((c) => ({ ...c, hidden: c.hidden.includes(key) ? c.hidden.filter((k) => k !== key) : [...c.hidden, key] }))
  }, [])
  const moveColumn = useCallback(
    (from, over) => {
      setColCfg((c) => {
        const arr = [...orderedKeys]
        const a = arr.indexOf(from)
        const b = arr.indexOf(over)
        if (a < 0 || b < 0) return c
        arr.splice(a, 1)
        arr.splice(b, 0, from)
        return { ...c, order: arr }
      })
    },
    [orderedKeys]
  )
  const resetColumns = useCallback(() => setColCfg({ order: [], hidden: [] }), [])
  const showAllColumns = useCallback(() => setColCfg((c) => ({ ...c, hidden: [] })), [])
  // hide every other person's column (Avg / Author / Song keep whatever state they have)
  const onlyMyColumn = useCallback(
    () =>
      setColCfg((c) => ({
        ...c,
        hidden: [...c.hidden.filter((k) => !k.startsWith('r:')), ...raters.filter((r) => r.id !== myRaterId).map((r) => `r:${r.id}`)],
      })),
    [raters, myRaterId]
  )

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
      const isText = sort.key === 'title' || sort.key === 'author' || sort.key === 'song'
      const val = (s) => (sort.key === 'avg' ? s.avg : s.scores[sort.key.slice(2)] ?? null)
      list = [...list].sort((a, b) => {
        if (isText) {
          const t1 = a[sort.key] ?? '', t2 = b[sort.key] ?? ''
          if (!t1 && t2) return 1 // empty values always last
          if (t1 && !t2) return -1
          return (compareText(t1, t2) || compareText(a.song, b.song) || a.id - b.id) * mul
        }
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

  /* ---------- preferred video source (saved in the account, works on every device) ---------- */
  const metaSource = session?.user?.user_metadata?.video_source === 'v' ? 'v' : 'yt'
  const [videoPref, setVideoPref] = useState(metaSource)
  useEffect(() => setVideoPref(metaSource), [metaSource])
  const prefRef = useRef(videoPref)
  prefRef.current = videoPref
  // "hide the average in the full-screen player": saved in the account too
  const metaHideAvg = session?.user?.user_metadata?.hide_avg === true
  const [hideAvg, setHideAvg] = useState(metaHideAvg)
  useEffect(() => setHideAvg(metaHideAvg), [metaHideAvg])
  const hideAvgRef = useRef(hideAvg)
  hideAvgRef.current = hideAvg
  const toggleHideAvg = useCallback(async () => {
    const before = hideAvgRef.current
    setHideAvg(!before)
    const { error } = await supabase.auth.updateUser({ data: { hide_avg: !before } })
    if (error) {
      setHideAvg(before)
      notify(`Not saved: ${error.message}`)
    }
  }, [notify])

  // "auto-play the next song when one ends": off by default, each user chooses (saved in the account)
  const metaAutoNext = session?.user?.user_metadata?.autoplay_next === true
  const [autoNext, setAutoNext] = useState(metaAutoNext)
  useEffect(() => setAutoNext(metaAutoNext), [metaAutoNext])
  const autoNextRef = useRef(autoNext)
  autoNextRef.current = autoNext
  const changeAutoNext = useCallback(
    async (value) => {
      const before = autoNextRef.current
      setAutoNext(value)
      const { error } = await supabase.auth.updateUser({ data: { autoplay_next: value } })
      if (error) {
        setAutoNext(before)
        notify(`Not saved: ${error.message}`)
      }
    },
    [notify]
  )

  const changeVideoSource = useCallback(
    async (value) => {
      const before = prefRef.current
      setVideoPref(value)
      const { error } = await supabase.auth.updateUser({ data: { video_source: value } })
      if (error) {
        setVideoPref(before)
        notify(`Not saved: ${error.message}`)
      }
    },
    [notify]
  )

  /* ---------- player ---------- */
  const rowsRef = useRef([])
  rowsRef.current = rows

  const playSong = useCallback((song) => {
    setTrack({ song, src: pickSource(song, prefRef.current) })
  }, [])

  const step = useCallback((dir) => {
    setTrack((t) => {
      if (!t) return t
      const list = rowsRef.current.filter((s) => s.youtube_url || s.vlink_url)
      const i = list.findIndex((s) => s.id === t.song.id)
      const next = i === -1 ? list[dir > 0 ? 0 : list.length - 1] : list[i + dir]
      return next ? { song: next, src: pickSource(next, prefRef.current) } : t
    })
  }, [])
  const next = useCallback(() => step(1), [step])
  const trackRef = useRef(null)
  trackRef.current = track
  const liveSong = useMemo(() => {
    if (!track) return null
    for (const k of Object.keys(data)) {
      const s = data[k].find((x) => x.id === track.song.id)
      if (s) return s
    }
    return track.song
  }, [data, track])

  // score the song that is playing, in my own column (null = remove my score)
  const rateCurrent = useCallback(
    (value) => {
      const t = trackRef.current
      if (t && myRaterId != null) saveScore(t.song.id, myRaterId, value, t.song.kind)
    },
    [saveScore, myRaterId]
  )

  // jump to the next song (in the list you are looking at) that I have not rated; returns false if none
  const nextUnrated = useCallback(() => {
    if (myRaterId == null) return false
    const list = rowsRef.current.filter((s) => s.youtube_url || s.vlink_url)
    const cur = trackRef.current?.song.id
    const i = list.findIndex((s) => s.id === cur)
    for (let k = 1; k <= list.length; k++) {
      const s = list[(i + k + list.length) % list.length]
      if (s.id !== cur && s.scores[myRaterId] == null) {
        setTrack({ song: s, src: pickSource(s, prefRef.current) })
        return true
      }
    }
    return false
  }, [myRaterId])
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
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <AccountMenu
              session={session}
              name={profile?.username}
              email={session?.user?.email}
              columnName={myRater?.name}
              isAdmin={isAdmin}
              videoSource={videoPref}
              autoNext={autoNext}
              onAutoNext={changeAutoNext}
              skin={skin}
              onSkin={changeSkin}
              onVideoSource={changeVideoSource}
              onAdmin={() => setShowAdmin(true)}
              onLogin={() => setShowAuth(true)}
              onLogout={() => supabase.auth.signOut()}
            />
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
                <input type="checkbox" checked={onlyUnrated} onChange={(e) => setOnlyUnrated(e.target.checked)} />
                <span className="long">Only songs I haven’t rated</span>
                <span className="short">Unrated</span>
              </label>
            )}
            {(sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) && (
              <button className="btn small" onClick={() => setSort(DEFAULT_SORT)}>Reset sort</button>
            )}
            <span className="muted">{rows.length} shown</span>
            <div className="toolbar-right">
              <ColumnsMenu
                items={menuItems}
                hidden={hiddenSet}
                onToggle={toggleColumn}
                onMove={moveColumn}
                onReset={resetColumns}
                onShowAll={showAllColumns}
                onOnlyMine={myRaterId ? onlyMyColumn : undefined}
              />
            </div>
          </div>
        )}
      </div>

      <div className="table-scroll">
      {onLogs ? (
        <LogsPage />
      ) : loading ? (
        <div className="center-msg vw">Loading…</div>
      ) : (
        <>
          <SongTable
            songs={visible}
            kind={tab}
            columns={columns}
            raterById={raterById}
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
      </div>

      {track && (
        <Player
          track={track}
          liveSong={liveSong}
          autoNext={autoNext}
          rating={{
            raterId: myRaterId,
            column: myRater?.name,
            hint: session ? 'Ask an admin to link your account to a rating column to rate songs.' : 'Log in to rate songs.',
            hideAvg,
            onToggleAvg: toggleHideAvg,
            onRate: rateCurrent,
            onNextUnrated: nextUnrated,
          }}
          onClose={closePlayer}
          onNext={next}
          onPrev={prev}
          onSource={setSource}
        />
      )}

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
