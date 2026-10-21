/* Numbers for the Stats tab. Everything is computed in the browser from the songs + scores that
   are already loaded, so the tab needs no extra requests and no database changes. */
export const SCOPES = [
  { key: 'ALL', label: 'Everything' },
  { key: 'OP', label: 'Openings' },
  { key: 'ED', label: 'Endings' },
  { key: 'INSERT', label: 'Inserts' },
]
const MIN_SCORES = { ALL: 20, OP: 10, ED: 10, INSERT: 8 } // how many scores someone needs to qualify for "average" titles
const KEYS = ['OP', 'ED', 'INSERT']

/* The titles. `get` is the number that decides the ranking; `qualify` filters people out. */
export const AWARDS = [
  { key: 'sugar', icon: '/icons/awards/sugar.png', title: 'Sugar Senpai', tagline: 'Every song is a masterpiece when your heart is this soft.', order: 'desc', get: (e) => e.avg, show: 'avg', needsMin: true },
  { key: 'tsundere', icon: '/icons/awards/tsundere.png', title: 'Tsundere Critic', tagline: '“It’s not like I liked it or anything… b-baka!”', order: 'asc', get: (e) => e.avg, show: 'avg', needsMin: true },
  { key: 'fanboy', icon: '/icons/awards/fanboy.png', title: 'Fanboy Supreme', tagline: 'Hands out perfect 10s like candy at a festival.', order: 'desc', get: (e) => e.tens, show: 'tens', need: (e) => e.tens > 0 },
  { key: 'villain', icon: '/icons/awards/villain.png', title: 'Villain Arc', tagline: 'Serves a cold, merciless 1 with a smile.', order: 'desc', get: (e) => e.ones, show: 'ones', need: (e) => e.ones > 0 },
  { key: 'chaos', icon: '/icons/awards/chaos.png', title: 'Chaos Gremlin', tagline: 'Scores swing from 1 to 10 with zero warning.', order: 'desc', get: (e) => e.std, show: 'std', needsMin: true },
  { key: 'zen', icon: '/icons/awards/zen.png', title: 'Zen Monk', tagline: 'Calm, steady, perfectly balanced scores.', order: 'asc', get: (e) => e.std, show: 'std', needsMin: true },
  { key: 'hive', icon: '/icons/awards/hive.png', title: 'Hive Mind', tagline: 'Always votes with the crowd. One of us!', order: 'asc', get: (e) => e.off, show: 'off', needsMin: true, offOnly: true },
  { key: 'wolf', icon: '/icons/awards/wolf.png', title: 'Lone Wolf', tagline: 'Walks their own path. The crowd? Never heard of it.', order: 'desc', get: (e) => e.off, show: 'off', needsMin: true, offOnly: true },
  { key: 'half', icon: '/icons/awards/wizard.png', title: 'Half-Point Hero', tagline: 'Why pick 8 when 8.5 exists? Lives on the half-steps.', order: 'desc', get: (e) => e.halfShare, show: 'half', needsMin: true },
]

const blank = () => ({ n: 0, sum: 0, sumSq: 0, tens: 0, ones: 0, halves: 0, offSum: 0, offN: 0 })

export function computeStats(data, raters) {
  const people = new Map(
    raters.map((r) => [r.id, { id: r.id, name: r.name, byScope: { ALL: blank(), OP: blank(), ED: blank(), INSERT: blank() } }])
  )
  for (const kind of KEYS) {
    for (const song of data[kind] || []) {
      const votes = Object.entries(song.scores || {})
      const count = votes.length
      const total = votes.reduce((a, [, v]) => a + v, 0)
      for (const [rid, v] of votes) {
        const p = people.get(Number(rid))
        if (!p) continue
        // how far this score is from what everybody ELSE gave the same song (needs 2+ other voters)
        const off = count >= 3 ? Math.abs(v - (total - v) / (count - 1)) : null
        for (const scope of ['ALL', kind]) {
          const a = p.byScope[scope]
          a.n += 1
          a.sum += v
          a.sumSq += v * v
          if (v === 10) a.tens += 1
          if (v === 1) a.ones += 1
          if (Math.round(v * 10) % 10 === 5) a.halves += 1 // ends in .5
          if (off != null) { a.offSum += off; a.offN += 1 }
        }
      }
    }
  }

  const songCount = { OP: data.OP?.length || 0, ED: data.ED?.length || 0, INSERT: data.INSERT?.length || 0 }
  songCount.ALL = songCount.OP + songCount.ED + songCount.INSERT

  const board = [...people.values()]
    .map((p) => ({ id: p.id, name: p.name, OP: p.byScope.OP.n, ED: p.byScope.ED.n, INSERT: p.byScope.INSERT.n, total: p.byScope.ALL.n }))
    .filter((p) => p.total > 0)

  const awardsFor = (scope) => {
    const min = MIN_SCORES[scope]
    const entries = [...people.values()]
      .map((p) => {
        const a = p.byScope[scope]
        const avg = a.n ? a.sum / a.n : null
        return {
          id: p.id, name: p.name, n: a.n, avg, tens: a.tens, ones: a.ones, halves: a.halves, halfShare: a.n ? a.halves / a.n : null,
          std: a.n ? Math.sqrt(Math.max(0, a.sumSq / a.n - avg * avg)) : null,
          off: a.offN ? a.offSum / a.offN : null, offN: a.offN,
        }
      })
      .filter((e) => e.n > 0)
    return AWARDS.map((aw) => {
      const ranked = entries
        .filter((e) => (aw.need ? aw.need(e) : true) && (aw.needsMin ? (aw.offOnly ? e.offN : e.n) >= min : true) && aw.get(e) != null)
        .sort((x, y) => (aw.order === 'desc' ? aw.get(y) - aw.get(x) : aw.get(x) - aw.get(y)) || y.n - x.n || String(x.name).localeCompare(String(y.name)))
        .slice(0, 3)
        .map((e) => ({ id: e.id, name: e.name, n: e.n, value: aw.get(e) }))
      return { ...aw, top: ranked, min: aw.needsMin ? min : null }
    })
  }

  return { board, songCount, awards: Object.fromEntries(SCOPES.map((s) => [s.key, awardsFor(s.key)])) }
}

export function formatValue(show, v) {
  switch (show) {
    case 'avg': return v.toFixed(2)
    case 'std': return `±${v.toFixed(2)}`
    case 'off': return `${v.toFixed(2)} off`
    case 'tens': return `${v} × 10`
    case 'ones': return `${v} × 1`
    case 'half': return `${Math.round(v * 100)}% halves`
    default: return String(v)
  }
}