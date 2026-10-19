import { useEffect, useRef, useState } from 'react'
import { parseScore, scoreHue } from '../utils.js'
import Icon from './Icon.jsx'

/* Rating bar shown in the full-screen player: score the song you are watching
   (in YOUR column) and jump to the next song you have not rated yet. */
export default function RatePanel({ song, raterId, column, hint, hideAvg, onToggleAvg, onRate, onNextUnrated }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const timer = useRef(null)
  const mine = raterId != null ? song?.scores?.[raterId] ?? null : null

  // keep the field in sync with the saved score (also after the song changes)
  useEffect(() => { setText(mine == null ? '' : String(mine)) }, [mine, song?.id])
  useEffect(() => () => clearTimeout(timer.current), [])

  const flash = (m) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 3500)
  }

  const commit = () => {
    const parsed = parseScore(text)
    if (Number.isNaN(parsed)) return flash('Score must be a number from 1 to 10')
    if (parsed !== mine) onRate(parsed)
  }

  const next = () => {
    if (!onNextUnrated()) flash('No unrated songs left in this list')
  }

  if (raterId == null) {
    return <div className="p-rate"><span className="p-rate-label">{hint}</span></div>
  }

  return (
    <div className="p-rate">
      <span className="p-rate-label">Your score{column ? ` (${column})` : ''}</span>
      <div className="p-rate-quick">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button key={n} className={mine === n ? 'on' : ''} style={{ '--h': scoreHue(n) }} onClick={() => onRate(n)}>
            {n}
          </button>
        ))}
      </div>
      <input
        value={text}
        inputMode="decimal"
        placeholder="e.g. 7.5"
        aria-label="Score"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {mine != null && (
        <button className="btn small" onClick={() => onRate(null)} title="Remove my score">Clear</button>
      )}
      <button
        className="p-rate-avg"
        onClick={onToggleAvg}
        title={hideAvg ? 'Show the average score' : 'Hide the average score (no spoilers)'}
      >
        <Icon name={hideAvg ? 'eye' : 'eye-off'} />
        {hideAvg
          ? `Avg #.# · ${song?.n ?? 0} vote${song?.n === 1 ? '' : 's'}`
          : `Avg ${song?.avg != null ? song.avg.toFixed(2) : '—'} · ${song?.n ?? 0} vote${song?.n === 1 ? '' : 's'}`}
      </button>
      {msg && <span className="p-rate-msg">{msg}</span>}
      <button className="btn primary p-rate-next" onClick={next}>Next unrated →</button>
    </div>
  )
}
