import { memo, useRef, useState } from 'react'
import { parseScore, scoreHue } from '../utils.js'

const ScoreCell = memo(function ScoreCell({ songId, raterId, value, editable, mine, onSave }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const cancelled = useRef(false)

  const start = () => {
    if (!editable) return
    cancelled.current = false
    setText(value == null ? '' : String(value))
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (cancelled.current) return
    const parsed = parseScore(text)
    if (Number.isNaN(parsed)) return alert('Score must be a number from 0 to 10')
    if (parsed !== (value ?? null)) onSave(songId, raterId, parsed)
  }

  const cls = ['cell', 'score', mine ? 'mine' : '', editable ? 'editable' : ''].join(' ')

  if (editing) {
    return (
      <td className={cls}>
        <input
          className="score-input"
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
          }}
        />
      </td>
    )
  }
  return (
    <td className={cls} onClick={start} title={editable ? 'Click to edit' : undefined}>
      {value != null ? (
        <span className="pill" style={{ '--h': scoreHue(value) }}>{value.toFixed(1)}</span>
      ) : null}
    </td>
  )
})

const Row = memo(function Row({ song, index, columns, raterById, myRaterId, isAdmin, playing, onSave, onEdit, onPlay }) {
  const playable = song.youtube_url || song.vlink_url
  return (
    <tr className={playing ? 'playing' : ''}>
      <td className="cell num">{index}</td>
      <td className="cell title">
        <div className="title-in">
          <span>{song.title}</span>
          {isAdmin && (
            <button className="icon-btn edit" title="Edit / delete this row" onClick={() => onEdit(song)}>✏</button>
          )}
        </div>
      </td>
      <td className="cell links">
        {playable && <button className="play-btn" title="Play here" onClick={() => onPlay(song)}>{playing ? '♪' : '▶'}</button>}
        {song.youtube_url && <a className="lk yt" href={song.youtube_url} target="_blank" rel="noopener noreferrer">YT</a>}
        {song.vlink_url && <a className="lk vl" href={song.vlink_url} target="_blank" rel="noopener noreferrer">V</a>}
      </td>
      {columns.map((k) => {
        if (k === 'author') return <td key={k} className="cell txt">{song.author}</td>
        if (k === 'song') return <td key={k} className="cell txt">{song.song}</td>
        if (k === 'avg') {
          return (
            <td key={k} className="cell avg" title={`${song.n} score(s)`}>
              {song.avg != null ? song.avg.toFixed(2) : '—'}
            </td>
          )
        }
        const r = raterById[k.slice(2)]
        if (!r) return null
        const mine = myRaterId != null && r.id === myRaterId
        return (
          <ScoreCell
            key={k}
            songId={song.id}
            raterId={r.id}
            value={song.scores[r.id] ?? null}
            mine={mine}
            editable={isAdmin || mine}
            onSave={onSave}
          />
        )
      })}
    </tr>
  )
})

export default function SongTable({ songs, kind, columns, raterById, myRaterId, isAdmin, playingId, sort, onSort, onSave, onEdit, onPlay }) {
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="num">#</th>
            <th className="title sortable" onClick={() => onSort('title')}>{kind === 'INSERT' ? 'Title' : 'Name'}{arrow('title')}</th>
            <th className="links">Links</th>
            {columns.map((k) => {
              if (k === 'author' || k === 'song') {
                return <th key={k} className="txt sortable" onClick={() => onSort(k)}>{k === 'author' ? 'Author' : 'Song'}{arrow(k)}</th>
              }
              if (k === 'avg') return <th key={k} className="avg sortable" onClick={() => onSort('avg')}>Avg{arrow('avg')}</th>
              const r = raterById[k.slice(2)]
              if (!r) return null
              return (
                <th
                  key={k}
                  className={`score sortable ${myRaterId != null && r.id === myRaterId ? 'mine' : ''}`}
                  onClick={() => onSort(k)}
                  title={`Sort by ${r.name}`}
                >
                  {r.name}{arrow(k)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {songs.map((s, i) => (
            <Row
              key={s.id}
              song={s}
              index={i + 1}
              columns={columns}
              raterById={raterById}
              myRaterId={myRaterId}
              isAdmin={isAdmin}
              playing={s.id === playingId}
              onSave={onSave}
              onEdit={onEdit}
              onPlay={onPlay}
            />
          ))}
          {songs.length === 0 && (
            <tr><td className="cell empty" colSpan={20}>Nothing here.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
