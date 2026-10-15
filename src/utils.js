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
