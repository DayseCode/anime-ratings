import { useCallback, useEffect, useRef, useState } from 'react'
import { fmtTime, playableSources, youtubeId } from '../utils.js'

/* remember small preferences (hidden video, volume) in this browser */
function usePersisted(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s == null ? initial : JSON.parse(s)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
  }, [key, v])
  return [v, setV]
}

/* ---------- YouTube IFrame API loader ---------- */
let ytPromise = null
function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (!ytPromise) {
    ytPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    })
  }
  return ytPromise
}

/* ---------- engine 1: direct video file (VLINK) ---------- */
function VideoEngine({ url, volume, muted, ctrl, onState, onEnded }) {
  const ref = useRef(null)

  useEffect(() => {
    ref.current.volume = volume
    ref.current.muted = muted
  }, [volume, muted])

  useEffect(() => {
    const v = ref.current
    ctrl.current = {
      toggle: () => (v.paused ? v.play().catch(() => {}) : v.pause()),
      seek: (t) => { v.currentTime = t },
    }
    return () => { ctrl.current = null }
  }, [ctrl])

  const sync = () => {
    const v = ref.current
    if (!v) return
    onState({
      playing: !v.paused && !v.ended,
      time: v.currentTime || 0,
      duration: Number.isFinite(v.duration) ? v.duration : 0,
    })
  }

  return (
    <video
      ref={ref}
      src={url}
      autoPlay
      playsInline
      preload="auto"
      onPlay={sync}
      onPause={sync}
      onTimeUpdate={sync}
      onLoadedMetadata={sync}
      onEnded={onEnded}
      onError={() => onState({ playing: false, error: 'This video cannot be played here.' })}
    />
  )
}

/* ---------- engine 2: YouTube ---------- */
function YouTubeEngine({ videoId, volume, muted, ctrl, onState, onEnded }) {
  const host = useRef(null)
  const player = useRef(null)
  const prefs = useRef({ volume, muted })
  const endedRef = useRef(onEnded)
  prefs.current = { volume, muted }
  endedRef.current = onEnded

  const applyVolume = () => {
    const p = player.current
    if (!p || !p.setVolume) return
    p.setVolume(Math.round(prefs.current.volume * 100))
    if (prefs.current.muted) p.mute()
    else p.unMute()
  }
  useEffect(applyVolume, [volume, muted]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let dead = false
    let timer
    const poll = () => {
      const p = player.current
      if (!p || !p.getCurrentTime) return
      onState({ playing: p.getPlayerState() === 1, time: p.getCurrentTime() || 0, duration: p.getDuration() || 0 })
    }
    loadYT().then((YT) => {
      if (dead || !host.current) return
      const el = document.createElement('div')
      host.current.appendChild(el)
      player.current = new YT.Player(el, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: (e) => {
            applyVolume()
            e.target.playVideo()
            timer = setInterval(poll, 400)
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) endedRef.current?.()
            poll()
          },
          onError: () => onState({ playing: false, error: 'YouTube does not allow embedding this video.' }),
        },
      })
    })
    ctrl.current = {
      toggle: () => {
        const p = player.current
        if (!p || !p.getPlayerState) return
        p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo()
      },
      seek: (t) => player.current?.seekTo?.(t, true),
    }
    return () => {
      dead = true
      clearInterval(timer)
      ctrl.current = null
      try { player.current?.destroy() } catch { /* ignore */ }
      player.current = null
      if (host.current) host.current.innerHTML = ''
    }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="p-yt-host" ref={host} />
}

/* ---------- the player panel ---------- */
export default function Player({ track, onClose, onNext, onPrev, onSource }) {
  const { song, src } = track
  const sources = playableSources(song)
  const current = sources.find((s) => s.key === src) || sources[0]

  const [hidden, setHidden] = usePersisted('player.hideVideo', false)
  const [volume, setVolume] = usePersisted('player.volume', 0.8)
  const [muted, setMuted] = usePersisted('player.muted', false)
  const [ps, setPs] = useState({ playing: false, time: 0, duration: 0, error: null })
  const ctrl = useRef(null)
  const rootRef = useRef(null)
  const [full, setFull] = useState(false)

  // Real browser fullscreen when available, otherwise a "fill the window" fallback (e.g. iPhone)
  const toggleFull = async () => {
    if (full) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
      setFull(false)
    } else {
      setFull(true)
      try { await rootRef.current?.requestFullscreen?.() } catch { /* fallback stays active */ }
    }
  }
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFull(false) }
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) setFull(false) }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  const merge = useCallback((p) => setPs((s) => ({ ...s, ...p })), [])

  useEffect(() => {
    setPs({ playing: false, time: 0, duration: 0, error: null })
  }, [current?.url])

  // if YouTube refuses to play, fall back to the other link automatically
  useEffect(() => {
    if (ps.error && current?.key === 'yt' && sources.some((s) => s.key === 'v')) onSource('v')
  }, [ps.error]) // eslint-disable-line react-hooks/exhaustive-deps

  const ytId = current?.key === 'yt' ? youtubeId(current.url) : null
  const title = song.song ? `${song.title} — ${song.song}` : song.title
  const error = ps.error || (current?.key === 'yt' && !ytId ? 'Cannot read this YouTube link.' : null)

  return (
    <div className={`player ${full ? 'full' : ''}`} ref={rootRef}>
      <div className="p-head">
        <span className="p-title" title={title}>{title}</span>
        {sources.length > 1 &&
          sources.map((s) => (
            <button key={s.key} className={`src-btn ${current.key === s.key ? 'on' : ''}`} onClick={() => onSource(s.key)}>
              {s.key === 'yt' ? 'YT' : 'V'}
            </button>
          ))}
        {current && <a className="icon-btn" href={current.url} target="_blank" rel="noopener noreferrer" title="Open in a new tab">↗</a>}
        <button className="icon-btn" onClick={onClose} title="Close player">✕</button>
      </div>

      <div className="p-screen" onDoubleClick={toggleFull}>
        {current?.key === 'yt' && ytId && (
          <YouTubeEngine key={current.url} videoId={ytId} volume={volume} muted={muted} ctrl={ctrl} onState={merge} onEnded={onNext} />
        )}
        {current?.key === 'v' && (
          <VideoEngine key={current.url} url={current.url} volume={volume} muted={muted} ctrl={ctrl} onState={merge} onEnded={onNext} />
        )}
        {error && (
          <div className="p-cover">
            <div>⚠ {error}</div>
            {current && <a className="btn small" href={current.url} target="_blank" rel="noopener noreferrer">Open the link</a>}
          </div>
        )}
        {hidden && !error && (
          <div className="p-cover">
            <div>🙈 Video hidden — audio only</div>
            <button className="btn small" onClick={() => setHidden(false)}>👁 Show video</button>
          </div>
        )}
      </div>

      <div className="p-seek">
        <span className="p-time">{fmtTime(ps.time)}</span>
        <input
          type="range"
          min="0"
          max={ps.duration || 1}
          step="0.1"
          value={Math.min(ps.time, ps.duration || 1)}
          onChange={(e) => {
            const t = Number(e.target.value)
            merge({ time: t })
            ctrl.current?.seek(t)
          }}
        />
        <span className="p-time">{fmtTime(ps.duration)}</span>
      </div>

      <div className="p-controls">
        <button className="icon-btn big" onClick={onPrev} title="Previous in list">⏮</button>
        <button className="icon-btn big" onClick={() => ctrl.current?.toggle()} title="Play / pause">{ps.playing ? '⏸' : '▶'}</button>
        <button className="icon-btn big" onClick={onNext} title="Next in list">⏭</button>
        <button className="icon-btn" onClick={() => setMuted(!muted)} title="Mute">{muted || volume === 0 ? '🔇' : '🔊'}</button>
        <input
          className="p-vol"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={(e) => {
            setVolume(Number(e.target.value))
            setMuted(false)
          }}
        />
        <button className="btn small" onClick={() => setHidden(!hidden)}>{hidden ? '👁 Show video' : '🙈 Hide video'}</button>
        <button className="icon-btn big" onClick={toggleFull} title={full ? 'Exit full screen' : 'Full screen (or double-click the video)'}>{full ? '🗗' : '⛶'}</button>
      </div>
    </div>
  )
}
