import { useState } from 'react'

export default function EditSongModal({ song, onSave, onDelete, onClose }) {
  const isInsert = song.kind === 'INSERT'
  const [f, setF] = useState({
    title: song.title || '',
    author: song.author || '',
    song: song.song || '',
    youtube_url: song.youtube_url || '',
    vlink_url: song.vlink_url || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    if (!f.title.trim()) return setError('Name is required.')
    setBusy(true)
    setError('')
    const patch = {
      title: f.title.trim(),
      youtube_url: f.youtube_url.trim() || null,
      vlink_url: f.vlink_url.trim() || null,
    }
    if (isInsert) {
      patch.author = f.author.trim() || null
      patch.song = f.song.trim() || null
    }
    const err = await onSave(song.id, patch)
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>Edit {song.kind === 'OP' ? 'Opening' : song.kind === 'ED' ? 'Ending' : 'Insert'}</h2>
        <form onSubmit={submit}>
          <label>{isInsert ? 'Anime title:' : 'Anime name:'}</label>
          <input value={f.title} onChange={set('title')} />
          {isInsert && (
            <>
              <label>Author:</label>
              <input value={f.author} onChange={set('author')} />
              <label>Song:</label>
              <input value={f.song} onChange={set('song')} />
            </>
          )}
          <label>YouTube Link (URL):</label>
          <input value={f.youtube_url} onChange={set('youtube_url')} placeholder="https://youtube.com/..." />
          <label>Additional Link (VLINK):</label>
          <input value={f.vlink_url} onChange={set('vlink_url')} placeholder="https://..." />
          {error && <p className="error">{error}</p>}
          <button className="btn primary wide" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
        </form>
        <button
          className="btn danger wide"
          onClick={async () => {
            if (await onDelete(song)) onClose()
          }}
        >
          🗑 Delete this row
        </button>
      </div>
    </div>
  )
}
