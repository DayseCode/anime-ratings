import { useMemo, useState } from 'react'
import { scoreHue } from '../utils.js'
import { SCOPES, computeStats, formatValue } from '../stats.js'

const COLS = [
  ['OP', 'Openings', 'OP'],
  ['ED', 'Endings', 'ED'],
  ['INSERT', 'Inserts', 'INS'],
  ['total', 'Total', 'Total'],
]

// an award icon is either an emoji or a path / URL to an image (svg, png, webp...)
const isImg = (s) => /^(\/|https?:|data:)|\.(svg|png|webp|jpe?g|gif)$/i.test(String(s || ''))

const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase()

function Value({ show, v }) {
  if (show === 'avg') return <span className="pill" style={{ '--h': scoreHue(v) }}>{formatValue(show, v)}</span>
  return <span className="st-val">{formatValue(show, v)}</span>
}

export default function StatsPage({ data, raters, myRaterId }) {
  const stats = useMemo(() => computeStats(data, raters), [data, raters])
  const [sortKey, setSortKey] = useState('total')
  const [scope, setScope] = useState('ALL')

  const board = useMemo(
    () => [...stats.board].sort((a, b) => b[sortKey] - a[sortKey] || b.total - a.total || String(a.name).localeCompare(String(b.name))),
    [stats, sortKey]
  )
  const awards = stats.awards[scope]
  const allSongs = stats.songCount.ALL

  return (
    <div className="stats vw">
      <section>
        <div className="st-head">
          <h2 className="st-title">Leaderboard</h2>
          <span className="muted">Who rated the most songs · click a column to sort</span>
        </div>
        <div className="st-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th className="st-rank">#</th>
                <th className="st-name">Name</th>
                {COLS.map(([k, label, short]) => (
                  <th key={k} className={`st-num sortable ${sortKey === k ? 'sorted' : ''}`} onClick={() => setSortKey(k)}>
                    <span className="st-l">{label}</span><span className="st-s">{short}</span>{sortKey === k ? ' ▼' : ''}
                  </th>
                ))}
                <th className="st-progress">Of all songs</th>
              </tr>
            </thead>
            <tbody>
              {board.map((p, i) => (
                <tr key={p.id} className={p.id === myRaterId ? 'me' : ''}>
                  <td className="st-rank"><span className={`st-place p${i < 3 ? i + 1 : ''}`}>{i + 1}</span></td>
                  <td className="st-name"><span className="st-ava">{initial(p.name)}</span>{p.name}{p.id === myRaterId && <em className="st-you">you</em>}</td>
                  {COLS.map(([k]) => <td key={k} className={`st-num ${k === 'total' ? 'strong' : ''}`}>{p[k]}</td>)}
                  <td className="st-progress">
                    <span className="st-bar"><i style={{ width: `${allSongs ? Math.min(100, (p.total / allSongs) * 100) : 0}%` }} /></span>
                    <span className="st-pct">{allSongs ? Math.round((p.total / allSongs) * 100) : 0}%</span>
                  </td>
                </tr>
              ))}
              {board.length === 0 && <tr><td colSpan={7} className="empty">No scores yet.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td className="st-rank" />
                <td className="st-name">Songs on the site</td>
                <td className="st-num">{stats.songCount.OP}</td>
                <td className="st-num">{stats.songCount.ED}</td>
                <td className="st-num">{stats.songCount.INSERT}</td>
                <td className="st-num strong">{allSongs}</td>
                <td className="st-progress" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <div className="st-head">
          <h2 className="st-title">Hall of Fame</h2>
          <div className="subtabs st-scope">
            {SCOPES.map((s) => (
              <button key={s.key} className={scope === s.key ? 'on' : ''} onClick={() => setScope(s.key)}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="st-grid">
          {awards.map((a) => (
            <article key={a.key} className="st-award">
              <header>
                <span className="st-ico" aria-hidden="true">{isImg(a.icon) ? <img src={a.icon} alt="" draggable="false" /> : a.icon}</span>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.tagline}</p>
                </div>
              </header>
              {a.top.length ? (
                <>
                  <div className={`st-winner ${a.top[0].id === myRaterId ? 'me' : ''}`}>
                    <span className="st-ava big">{initial(a.top[0].name)}</span>
                    <b>{a.top[0].name}</b>
                    <Value show={a.show} v={a.top[0].value} />
                  </div>
                  {a.top.length > 1 && (
                    <ol className="st-rest" start={2}>
                      {a.top.slice(1).map((t) => (
                        <li key={t.id} className={t.id === myRaterId ? 'me' : ''}>
                          <span className="st-name">{t.name}</span>
                          <Value show={a.show} v={t.value} />
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              ) : (
                <div className="st-none">Not enough scores yet</div>
              )}
              {a.min && <small className="st-min">needs at least {a.min} scores here</small>}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
