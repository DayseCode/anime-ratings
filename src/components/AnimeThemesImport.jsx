import { useMemo, useRef, useState } from 'react'

/* Import OP / ED rows from the AnimeThemes database (https://animethemes.moe).
   Type an anime title -> pick the anime -> tick the themes -> they are added as normal rows,
   with the AnimeThemes video link in the VLINK column. Works only in the browser, no DB changes. */
// the public API lives at /anime (some docs show /api/anime, so that one is only a fallback)
const API_URLS = ['https://api.animethemes.moe/anime', 'https://api.animethemes.moe/api/anime']
const INCLUDE = 'animethemes.song.artists,animethemes.animethemeentries.videos'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const norm = (s) => String(s || '').trim().toLowerCase()

// every video of a theme as { url, label }, best choice first (lowest version, no-credits, no episode overlap, highest resolution)
function videoOptions(theme) {
  const seen = new Set()
  const list = []
  for (const entry of theme.animethemeentries || []) {
    const version = num(entry.version) || 1
    for (const v of entry.videos || []) {
      const url = v.link || (v.basename ? `https://v.animethemes.moe/${v.basename}.webm` : null)
      if (!url || seen.has(url)) continue
      seen.add(url)
      const overlap = v.overlap && v.overlap !== 'None' ? v.overlap : null
      const parts = [`v${version}`]
      if (v.nc) parts.push('no credits')
      if (v.resolution) parts.push(`${v.resolution}p`)
      if (v.source) parts.push(v.source)
      if (v.lyrics) parts.push('lyrics')
      if (v.subbed) parts.push('subbed')
      if (overlap) parts.push(`${overlap.toLowerCase()} episode`)
      if (entry.notes) parts.push(entry.notes)
      list.push({ url, label: parts.join(' · '), rank: [version, v.nc ? 0 : 1, overlap ? 1 : 0, v.lyrics || v.subbed ? 1 : 0, -num(v.resolution)] })
    }
  }
  return list.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i]
    return 0
  })
}

function themesOf(anime) {
  return (anime.animethemes || [])
    .filter((t) => t.type === 'OP' || t.type === 'ED')
    .map((t) => ({
      key: t.id ?? `${t.type}${t.sequence}`,
      kind: t.type,
      slug: t.slug || `${t.type}${t.sequence ?? ''}`,
      seq: num(t.sequence),
      song: t.song?.title || '',
      artists: (t.song?.artists || []).map((a) => a.name).filter(Boolean).join(', '),
      options: videoOptions(t),
    }))
    .sort((a, b) => (a.kind === b.kind ? a.seq - b.seq : a.kind === 'OP' ? -1 : 1))
}

export default function AnimeThemesImport({ data, onAdd }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [found, setFound] = useState(null) // null = not searched yet
  const [current, setCurrent] = useState(null) // the anime whose themes are shown
  const [rows, setRows] = useState([]) // [{ ...theme, title, opt, checked }]
  const [msg, setMsg] = useState(null)
  const reqId = useRef(0)

  const open = (anime) => {
    setCurrent(anime)
    setMsg(null)
    setRows(
      themesOf(anime).map((t) => ({ ...t, title: `${anime.name} [${t.slug}]`, opt: 0, checked: t.options.length > 0 }))
    )
  }

  async function search(e) {
    e.preventDefault()
    const text = q.trim()
    if (!text) return
    const id = ++reqId.current
    setBusy(true)
    setMsg(null)
    setCurrent(null)
    setRows([])
    try {
      const params = new URLSearchParams({ q: text, include: INCLUDE, 'page[size]': '10' })
      let res = null
      for (const base of API_URLS) {
        res = await fetch(`${base}?${params}`)
        if (res.status !== 404) break // 404 = wrong address, try the next one
      }
      if (!res.ok) throw new Error(`AnimeThemes answered ${res.status}`)
      const json = await res.json()
      if (id !== reqId.current) return
      const list = json.anime || json.data || []
      setFound(list)
      if (list.length === 1) open(list[0])
    } catch (err) {
      if (id !== reqId.current) return
      setFound(null)
      setMsg({ type: 'error', text: `Could not load AnimeThemes (${err.message}). Check your connection and try again.` })
    } finally {
      if (id === reqId.current) setBusy(false)
    }
  }

  // already in the table: same title in the same tab, or the same video link anywhere
  const existing = useMemo(() => {
    const titles = new Set()
    const links = new Set()
    for (const k of ['OP', 'ED']) {
      for (const s of data[k] || []) {
        titles.add(`${k}|${norm(s.title)}`)
        if (s.vlink_url) links.add(norm(s.vlink_url))
      }
    }
    return { titles, links }
  }, [data])
  const isDup = (r) => existing.titles.has(`${r.kind}|${norm(r.title)}`) || (r.options[r.opt] && existing.links.has(norm(r.options[r.opt].url)))

  const patch = (key, p) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const chosen = rows.filter((r) => r.checked && r.options.length && !isDup(r) && r.title.trim())

  async function addSelected() {
    setAdding(true)
    setMsg(null)
    let ok = 0
    let failed = null
    for (const r of chosen) {
      const err = await onAdd({ kind: r.kind, title: r.title.trim(), youtube_url: null, vlink_url: r.options[r.opt].url })
      if (err) { failed = err; break }
      ok += 1
      patch(r.key, { checked: false })
    }
    setAdding(false)
    setMsg(failed ? { type: 'error', text: `Added ${ok}, then stopped: ${failed}` } : { type: 'ok', text: `Added ${ok} song${ok === 1 ? '' : 's'}.` })
  }

  const setAll = (v) => setRows((rs) => rs.map((r) => ({ ...r, checked: v && r.options.length > 0 })))

  return (
    <details className="at-import">
      <summary>Import from AnimeThemes</summary>
      <form className="at-search" onSubmit={search}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Anime title, e.g. Bleach" aria-label="Anime title" />
        <button className="btn primary" disabled={busy || !q.trim()}>{busy ? 'Searching…' : 'Search'}</button>
      </form>

      {found && found.length === 0 && <p className="muted">Nothing found for “{q.trim()}”.</p>}
      {found && found.length > 1 && (
        <div className="at-anime">
          {found.map((a) => (
            <button key={a.id ?? a.slug} className={`btn small ${current?.id === a.id ? 'primary' : ''}`} onClick={() => open(a)}>
              {a.name}{a.year ? ` (${a.year})` : ''}
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="at-themes">
          <div className="at-bar">
            <b>{current.name}</b>
            <span className="muted">{rows.length} OP/ED found</span>
            <span className="at-bar-r">
              <button className="btn small" onClick={() => setAll(true)}>All</button>
              <button className="btn small" onClick={() => setAll(false)}>None</button>
            </span>
          </div>
          {rows.length === 0 && <p className="muted">This anime has no openings or endings in AnimeThemes.</p>}
          <ul className="at-list">
            {rows.map((r) => {
              const dup = isDup(r)
              return (
                <li key={r.key} className={dup ? 'dup' : ''}>
                  <input
                    type="checkbox"
                    checked={r.checked && !dup && r.options.length > 0}
                    disabled={dup || r.options.length === 0}
                    onChange={(e) => patch(r.key, { checked: e.target.checked })}
                    aria-label={`Add ${r.title}`}
                  />
                  <div className="at-main">
                    <input className="at-title" value={r.title} onChange={(e) => patch(r.key, { title: e.target.value })} aria-label="Title" />
                    <small className="muted">
                      {[r.song, r.artists].filter(Boolean).join(' – ') || 'unknown song'}
                      {dup && ' · already in the table'}
                      {r.options.length === 0 && ' · no video on AnimeThemes'}
                    </small>
                  </div>
                  {r.options.length > 1 && (
                    <select value={r.opt} onChange={(e) => patch(r.key, { opt: Number(e.target.value) })} aria-label="Video version">
                      {r.options.map((o, i) => <option key={o.url} value={i}>{o.label}</option>)}
                    </select>
                  )}
                </li>
              )
            })}
          </ul>
          {rows.length > 0 && (
            <button className="btn primary" onClick={addSelected} disabled={adding || chosen.length === 0}>
              {adding ? 'Adding…' : `Add ${chosen.length} selected`}
            </button>
          )}
        </div>
      )}
      {msg && <p className={msg.type === 'ok' ? 'ok' : 'error'}>{msg.text}</p>}
    </details>
  )
}
