export const KINDS = [
  { key: 'OP', label: 'Openings', single: 'Opening' },
  { key: 'ED', label: 'Endings', single: 'Ending' },
  { key: 'INSERT', label: 'Inserts', single: 'Insert' },
]

export const BADGE = { OP: 'OP', ED: 'ED', INSERT: 'INS' }

export const isYoutube = (u) => /(youtube\.com|youtu\.be)/i.test(u || '')

// red (1) -> yellow (5.5) -> green (10)
export const scoreColor = (s) => {
  const x = Math.min(10, Math.max(1, s))
  return `hsl(${Math.round(((x - 1) / 9) * 120)} 55% 30%)`
}

export function stats(scores) {
  const vals = Object.values(scores)
  const n = vals.length
  return { n, avg: n ? vals.reduce((a, b) => a + b, 0) / n : null }
}

// raw row from Supabase (with embedded scores[]) -> UI object
export function normalizeSong(raw) {
  const scores = {}
  for (const s of raw.scores || []) scores[s.rater_id] = Number(s.score)
  return { ...raw, scores, ...stats(scores) }
}

// "9,5" / "9.5" / " 8 " -> number | null (empty) | NaN (invalid)
export function parseScore(text) {
  const t = String(text).trim().replace(',', '.')
  if (t === '') return null
  const v = Number(t)
  if (!Number.isFinite(v) || v < 0 || v > 10) return NaN
  return Math.round(v * 10) / 10
}

export const SONG_COLUMNS = 'id,kind,title,author,song,youtube_url,vlink_url'

export async function fetchAllSongs(supabase, kind) {
  // Supabase returns max 1000 rows per request, so we page through.
  const size = 1000
  const all = []
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('songs')
      .select(`${SONG_COLUMNS},scores(rater_id,score)`)
      .eq('kind', kind)
      .order('id')
      .range(from, from + size - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < size) break
  }
  return all.map(normalizeSong)
}

/* ---------- player helpers ---------- */

export function youtubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{6,})/)
    return m ? m[2] : null
  } catch {
    return null
  }
}

// which sources a song can be played from, YouTube first
export function playableSources(song) {
  const list = []
  if (song.youtube_url) list.push({ key: 'yt', url: song.youtube_url })
  if (song.vlink_url) list.push({ key: 'v', url: song.vlink_url })
  return list
}

export const fmtTime = (t) => {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ---------- live updates ---------- */

// apply a batch of score changes ({songId, raterId, value|null}) made by other people
export function applyScoreChanges(d, batch) {
  const bySong = new Map()
  for (const c of batch) {
    if (!bySong.has(c.songId)) bySong.set(c.songId, [])
    bySong.get(c.songId).push(c)
  }
  let changed = false
  const next = { ...d }
  for (const kind of Object.keys(d)) {
    let kindChanged = false
    const list = d[kind].map((s) => {
      const cs = bySong.get(s.id)
      if (!cs) return s
      const scores = { ...s.scores }
      for (const c of cs) {
        if (c.value == null) delete scores[c.raterId]
        else scores[c.raterId] = c.value
      }
      kindChanged = true
      return { ...s, scores, ...stats(scores) }
    })
    if (kindChanged) {
      next[kind] = list
      changed = true
    }
  }
  return changed ? next : d
}

// apply one realtime event of the "songs" table (someone added / edited / deleted a song)
export function applySongEvent(d, p) {
  if (p.eventType === 'DELETE') {
    const id = p.old?.id
    if (id == null) return d
    let changed = false
    const next = { ...d }
    for (const kind of Object.keys(d)) {
      if (d[kind].some((s) => s.id === id)) {
        next[kind] = d[kind].filter((s) => s.id !== id)
        changed = true
      }
    }
    return changed ? next : d
  }

  const row = p.new
  if (!row || row.id == null || !d[row.kind]) return d
  const fields = {
    id: row.id, kind: row.kind, title: row.title, author: row.author,
    song: row.song, youtube_url: row.youtube_url, vlink_url: row.vlink_url,
  }
  const next = { ...d }
  let existing = null
  for (const kind of Object.keys(d)) {
    const found = d[kind].find((s) => s.id === row.id)
    if (!found) continue
    existing = found
    if (kind !== row.kind) next[kind] = d[kind].filter((s) => s.id !== row.id) // type was changed
  }
  if (existing && d[row.kind].includes(existing)) {
    next[row.kind] = d[row.kind].map((s) => (s.id === row.id ? { ...s, ...fields } : s))
  } else {
    const scores = existing ? existing.scores : {}
    next[row.kind] = [...d[row.kind], { ...fields, scores, ...stats(scores) }].sort((a, b) => a.id - b.id)
  }
  return next
}
