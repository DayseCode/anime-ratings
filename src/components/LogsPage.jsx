import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'

const PAGE = 100
const ENTITIES = [
  ['all', 'All'],
  ['score', 'Scores'],
  ['song', 'Songs'],
  ['rater', 'Columns'],
  ['profile', 'Accounts'],
]
const LABEL = { score: 'Score', song: 'Song', rater: 'Column', profile: 'Account' }

export default function LogsPage() {
  const [rows, setRows] = useState([])
  const [entity, setEntity] = useState('all')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')

  async function fetchPage(from, reset) {
    setLoading(true)
    setError('')
    let query = supabase.from('audit_log').select('*').order('id', { ascending: false }).range(from, from + PAGE - 1)
    if (entity !== 'all') query = query.eq('entity', entity)
    const { data, error } = await query
    if (error) setError(error.message.includes('audit_log') ? 'The log table is missing. Run supabase/logs.sql in the Supabase SQL Editor.' : error.message)
    else {
      setRows((prev) => (reset ? data : [...prev, ...data]))
      setHasMore(data.length === PAGE)
    }
    setLoading(false)
  }

  useEffect(() => { fetchPage(0, true) }, [entity]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? rows.filter((r) => `${r.actor} ${r.summary}`.toLowerCase().includes(s)) : rows
  }, [rows, q])

  return (
    <div className="logs vw">
      <div className="toolbar">
        <h2 className="logs-title">Change log</h2>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className="dark-select">
          {ENTITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="search" placeholder="Filter by user or text…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => fetchPage(0, true)}>↻ Refresh</button>
      </div>
      {error && <div className="banner">{error}</div>}
      <div className="logs-wrap">
        <table className="logs-table">
          <thead>
            <tr><th>When</th><th>Who</th><th>Type</th><th>What changed</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{new Date(r.at).toLocaleString()}</td>
                <td>{r.actor}</td>
                <td><span className={`etag ${r.entity}`}>{LABEL[r.entity]}</span></td>
                <td className="what">
                  {r.summary}
                  {r.entity === 'song' && r.details && (
                    <details>
                      <summary>details</summary>
                      <pre>{JSON.stringify(r.details, null, 1)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {!loading && shown.length === 0 && <tr><td colSpan={4} className="empty">No changes recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="more">
        {loading ? <span className="muted">Loading…</span> : hasMore && <button className="btn" onClick={() => fetchPage(rows.length, false)}>Load older</button>}
      </div>
    </div>
  )
}
