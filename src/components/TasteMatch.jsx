import { useMemo, useState } from 'react'
import { BADGE, hasLink } from '../utils.js'

const MIN_COMMON = 10
const MIN_OTHERS = 3
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2)

/* "Taste match": who rates like me (Twins) and where I disagree with everyone else.
   Computed from the data that is already loaded (all 3 kinds together). */
export default function TasteMatch({ data, raters, myRaterId, onPlay, onClose }) {
  const [tab, setTab] = useState('twins')

  const twins = useMemo(() => {
    if (myRaterId == null) return []
    const sum = {}
    const cnt = {}
    for (const kind of Object.keys(data)) {
      for (const s of data[kind]) {
        const mine = s.scores[myRaterId]
        if (mine == null) continue
        for (const id of Object.keys(s.scores)) {
          if (id === String(myRaterId)) continue
          sum[id] = (sum[id] || 0) + Math.abs(mine - s.scores[id])
          cnt[id] = (cnt[id] || 0) + 1
        }
      }
    }
    return raters
      .filter((r) => r.id !== myRaterId && (cnt[r.id] || 0) >= MIN_COMMON)
      .map((r) => ({ id: r.id, name: r.name, common: cnt[r.id], sim: 100 - (100 * (sum[r.id] / cnt[r.id])) / 9 }))
      .sort((a, b) => b.sim - a.sim || b.common - a.common)
  }, [data, raters, myRaterId])

  const diffs = useMemo(() => {
    if (myRaterId == null) return []
    const list = []
    for (const kind of Object.keys(data)) {
      for (const s of data[kind]) {
        const mine = s.scores[myRaterId]
        if (mine == null) continue
        let total = 0
        let n = 0
        for (const id of Object.keys(s.scores)) {
          if (id === String(myRaterId)) continue
          total += s.scores[id]
          n += 1
        }
        if (n < MIN_OTHERS) continue
        const others = total / n
        list.push({ song: s, mine, others, diff: mine - others })
      }
    }
    return list.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 20)
  }, [data, myRaterId])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal tm-modal">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>Taste match</h2>
        {myRaterId == null ? (
          <p className="muted">Your account isn’t linked to a rating column yet, so there is nothing to compare. Ask an admin to link you.</p>
        ) : (
          <>
            <div className="seg tm-tabs" role="group" aria-label="Taste match view">
              <button className={tab === 'twins' ? 'on' : ''} onClick={() => setTab('twins')}>Twins</button>
              <button className={tab === 'diff' ? 'on' : ''} onClick={() => setTab('diff')}>Disagreements</button>
            </div>
            {tab === 'twins' ? (
              twins.length === 0 ? (
                <p className="muted">Nobody has {MIN_COMMON}+ rated songs in common with you yet (all Openings, Endings and Inserts counted together).</p>
              ) : (
                <div className="tm-scroll">
                  <table className="tm-table">
                    <thead>
                      <tr><th className="l">Person</th><th>Similarity</th><th>Common songs</th></tr>
                    </thead>
                    <tbody>
                      {twins.map((t, i) => (
                        <tr key={t.id}>
                          <td className="l">{t.name} {i === 0 && <span className="chip">Your twin</span>}</td>
                          <td>{fmt(t.sim)}%</td>
                          <td>{t.common}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : diffs.length === 0 ? (
              <p className="muted">No songs yet that you and at least {MIN_OTHERS} other people have rated.</p>
            ) : (
              <div className="tm-scroll">
                <table className="tm-table">
                  <thead>
                    <tr><th className="l">Song</th><th>Mine</th><th>Others’ avg</th><th>Difference</th></tr>
                  </thead>
                  <tbody>
                    {diffs.map((d) => {
                      const playable = hasLink(d.song)
                      const label = d.song.song ? `${d.song.title} – ${d.song.song}` : d.song.title
                      return (
                        <tr key={d.song.id}>
                          <td className="l">
                            <span className="muted">{BADGE[d.song.kind] || d.song.kind}</span>{' '}
                            {playable ? (
                              <button className="tm-link" onClick={() => onPlay(d.song)} title="Play">{label}</button>
                            ) : (
                              label
                            )}
                          </td>
                          <td>{d.mine.toFixed(1)}</td>
                          <td>{fmt(d.others)}</td>
                          <td>{d.diff > 0 ? '+' : ''}{fmt(d.diff)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
