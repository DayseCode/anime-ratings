import { useMemo, useState } from 'react'
import { BADGE, compareText, hasLink, scoreHue } from '../utils.js'
import { MIN_VOTES_SPREAD, MIN_VOTES_TOP, SCOPES, computeInsights, computeStats, formatValue } from '../stats.js'

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

const signed = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`)

/* "Insights": song rankings and strict vs generous (one shared scope switch) */
function Insights({ ins, myRaterId, onPlay }) {
  const [scope, setScope] = useState('ALL')
  const [topMode, setTopMode] = useState('best') // 'best' | 'worst'
  const [spreadMode, setSpreadMode] = useState('wide') // 'wide' | 'agree'
  const [peopleSort, setPeopleSort] = useState('avg') // 'avg' | 'bias'
  const cur = ins[scope]

  const top = useMemo(
    () =>
      cur.songs
        .filter((s) => s.n >= MIN_VOTES_TOP)
        .sort((a, b) => (topMode === 'best' ? b.avg - a.avg : a.avg - b.avg) || b.n - a.n || compareText(a.title, b.title))
        .slice(0, 10),
    [cur, topMode]
  )
  const spread = useMemo(
    () =>
      cur.songs
        .filter((s) => s.n >= MIN_VOTES_SPREAD)
        .sort((a, b) => (spreadMode === 'wide' ? b.std - a.std : a.std - b.std) || b.n - a.n || compareText(a.title, b.title))
        .slice(0, 10),
    [cur, spreadMode]
  )
  const strict = useMemo(() => {
    const list = cur.people.filter((p) => p.n >= cur.minScores)
    const val = (p) => (peopleSort === 'bias' ? p.bias ?? -99 : p.avg)
    return list.sort((a, b) => val(b) - val(a) || b.n - a.n || compareText(a.name, b.name))
  }, [cur, peopleSort])

  const label = (s) => (s.song ? `${s.title} – ${s.song}` : s.title)
  const SongCell = ({ s }) => (
    <td className="st-name st-song">
      {scope === 'ALL' && <span className="muted st-kind">{BADGE[s.kind]}</span>}
      {onPlay && hasLink(s) ? (
        <button className="tm-link" onClick={() => onPlay(s.ref)} title="Play">{label(s)}</button>
      ) : (
        label(s)
      )}
    </td>
  )
  const Seg = ({ value, onChange, options }) => (
    <div className="seg st-seg" role="group">
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  )

  return (
    <section className="st-insights">
      <div className="st-head">
        <h2 className="st-title">Insights</h2>
        <div className="subtabs st-scope">
          {SCOPES.map((s) => (
            <button key={s.key} className={scope === s.key ? 'on' : ''} onClick={() => setScope(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="st-two">
        <div>
          <div className="st-head">
            <h3 className="st-sub">{topMode === 'best' ? 'Top 10 songs' : 'Lowest 10 songs'}</h3>
            <span className="muted">by average · {MIN_VOTES_TOP}+ votes</span>
            <Seg value={topMode} onChange={setTopMode} options={[['best', 'Best'], ['worst', 'Worst']]} />
          </div>
          <div className="st-wrap">
            <table className="st-table">
              <thead><tr><th className="st-rank">#</th><th className="st-name">Song</th><th className="st-num">Avg</th><th className="st-num">Votes</th></tr></thead>
              <tbody>
                {top.map((s, i) => (
                  <tr key={s.id}>
                    <td className="st-rank"><span className={`st-place p${topMode === 'best' && i < 3 ? i + 1 : ''}`}>{i + 1}</span></td>
                    <SongCell s={s} />
                    <td className="st-num"><span className="pill" style={{ '--h': scoreHue(s.avg) }}>{s.avg.toFixed(2)}</span></td>
                    <td className="st-num">{s.n}</td>
                  </tr>
                ))}
                {top.length === 0 && <tr><td colSpan={4} className="empty">No song has {MIN_VOTES_TOP}+ votes yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="st-head">
            <h3 className="st-sub">{spreadMode === 'wide' ? 'Most controversial' : 'Most agreed on'}</h3>
            <span className="muted">spread of scores · {MIN_VOTES_SPREAD}+ votes</span>
            <Seg value={spreadMode} onChange={setSpreadMode} options={[['wide', 'Divided'], ['agree', 'Agreed']]} />
          </div>
          <div className="st-wrap">
            <table className="st-table">
              <thead><tr><th className="st-rank">#</th><th className="st-name">Song</th><th className="st-num">Range</th><th className="st-num">Spread</th><th className="st-num">Avg</th><th className="st-num">Votes</th></tr></thead>
              <tbody>
                {spread.map((s, i) => (
                  <tr key={s.id}>
                    <td className="st-rank"><span className="st-place">{i + 1}</span></td>
                    <SongCell s={s} />
                    <td className="st-num">{s.min.toFixed(1)} – {s.max.toFixed(1)}</td>
                    <td className="st-num strong">±{s.std.toFixed(2)}</td>
                    <td className="st-num">{s.avg.toFixed(2)}</td>
                    <td className="st-num">{s.n}</td>
                  </tr>
                ))}
                {spread.length === 0 && <tr><td colSpan={6} className="empty">No song has {MIN_VOTES_SPREAD}+ votes yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

      <div>
        <div className="st-head">
          <h3 className="st-sub">Strict or generous?</h3>
          <span className="muted">needs {cur.minScores}+ scores · “vs others” = your score minus what others gave the same songs · click a column to sort</span>
        </div>
        <div className="st-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th className="st-rank">#</th>
                <th className="st-name">Name</th>
                <th className={`st-num sortable ${peopleSort === 'avg' ? 'sorted' : ''}`} onClick={() => setPeopleSort('avg')}>Avg{peopleSort === 'avg' ? ' ▼' : ''}</th>
                <th className={`st-num sortable ${peopleSort === 'bias' ? 'sorted' : ''}`} onClick={() => setPeopleSort('bias')}>vs others{peopleSort === 'bias' ? ' ▼' : ''}</th>
                <th className="st-num">Scores</th>
              </tr>
            </thead>
            <tbody>
              {strict.map((p, i) => (
                <tr key={p.id} className={p.id === myRaterId ? 'me' : ''}>
                  <td className="st-rank"><span className="st-place">{i + 1}</span></td>
                  <td className="st-name">
                    {p.name}
                    {p.id === myRaterId && <em className="st-you">you</em>}
                    {strict.length > 1 && i === 0 && <span className="chip st-chip">Most generous</span>}
                    {strict.length > 1 && i === strict.length - 1 && <span className="chip st-chip">Strictest</span>}
                  </td>
                  <td className="st-num"><span className="pill" style={{ '--h': scoreHue(p.avg) }}>{p.avg.toFixed(2)}</span></td>
                  <td className="st-num strong">{signed(p.bias)}</td>
                  <td className="st-num">{p.n}</td>
                </tr>
              ))}
              {strict.length === 0 && <tr><td colSpan={5} className="empty">Nobody has {cur.minScores}+ scores here yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </div>

    </section>
  )
}

export default function StatsPage({ data, raters, myRaterId, onPlay }) {
  const stats = useMemo(() => computeStats(data, raters), [data, raters])
  const ins = useMemo(() => computeInsights(data, raters), [data, raters])
  const all = ins.ALL
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
      <section className="st-overview">
        <div className="st-head">
          <h2 className="st-title">Overview</h2>
          <span className="muted">All Openings, Endings and Inserts together</span>
        </div>
        <div className="st-tiles">
          <div><b>{all.songCount}</b><span>songs</span></div>
          <div><b>{all.scores}</b><span>scores given</span></div>
          <div><b>{all.raters}</b><span>people rating</span></div>
          <div><b>{all.avg != null ? all.avg.toFixed(2) : '—'}</b><span>average score</span></div>
          <div><b>{all.songCount ? (all.scores / all.songCount).toFixed(1) : '—'}</b><span>votes per song</span></div>
          <div><b>{all.unrated}</b><span>nobody rated yet</span></div>
        </div>
      </section>

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

      <Insights ins={ins} myRaterId={myRaterId} onPlay={onPlay} />
    </div>
  )
}
