import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/* Floating mini player: drag it by the title bar, resize it from any corner.
   - width and height are linked: the video stays 16:9, so the height simply follows the width
   - size limits (in rem, like the rest of the page) + it always stays inside the window
   - position and size are remembered while you switch songs (and close / re-open the player),
     but live only in memory, so a page refresh puts the player back in its default corner. */
const EDGE = 8 // px kept free around the window edge
const MIN_W = 24 // rem
const MAX_W = 60 // rem
const COMPACT_W = 26 // rem: narrower than this the volume slider is hidden, so the buttons always fit
const RATIO = 16 / 9

let saved = null // { left, top, width } in px; module level = survives song changes, reset by a refresh

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))
const viewport = () => ({ vw: document.documentElement.clientWidth, vh: window.innerHeight })

/* height of everything that is NOT the 16:9 picture (title bar + controls + borders) */
function chromeHeight(el) {
  const screen = el.querySelector('.p-screen')
  return el.getBoundingClientRect().height - (screen ? screen.getBoundingClientRect().height : 0)
}
const heightFor = (w, chrome) => chrome + (w - 2) / RATIO // 2px = the player's border

/* widest allowed width when only `availW` x `availH` px of window are free */
function widthLimits(availW, availH, chrome) {
  const r = remPx()
  const max = Math.min(MAX_W * r, availW, (availH - chrome) * RATIO + 2)
  return { min: Math.min(MIN_W * r, max), max }
}

function applyBox(el, b) {
  const s = el.style
  s.left = `${Math.round(b.left)}px`
  s.top = `${Math.round(b.top)}px`
  s.width = `${Math.round(b.width)}px`
  s.right = 'auto'
  s.bottom = 'auto'
  s.maxWidth = 'none'
  el.dataset.moved = '1'
  if (b.width < COMPACT_W * remPx()) el.dataset.compact = '1'
  else delete el.dataset.compact
}

function clearBox(el) {
  const s = el.style
  s.left = s.top = s.width = s.right = s.bottom = s.maxWidth = ''
  delete el.dataset.moved
  delete el.dataset.compact
}

/* fit a box into the window (used after a window resize / when the player comes back from full screen) */
function fitBox(el, b) {
  const { vw, vh } = viewport()
  const chrome = chromeHeight(el)
  const lim = widthLimits(vw - 2 * EDGE, vh - 2 * EDGE, chrome)
  const width = clamp(b.width, lim.min, lim.max)
  const h = heightFor(width, chrome)
  return { width, left: clamp(b.left, EDGE, vw - EDGE - width), top: clamp(b.top, EDGE, vh - EDGE - h) }
}

export default function useFloatingPlayer(rootRef, full) {
  const stopRef = useRef(null) // cleans up a drag / resize that is in progress

  // restore the remembered box (new song, re-opened player, back from full screen)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (full) clearBox(el) // full screen uses its own CSS (inset: 0)
    else if (saved) {
      saved = fitBox(el, saved)
      applyBox(el, saved)
    }
  }, [full, rootRef])

  // keep the player inside the window when the window changes size / the phone is rotated
  useEffect(() => {
    const onResize = () => {
      const el = rootRef.current
      if (!el || full || !saved) return
      saved = fitBox(el, saved)
      applyBox(el, saved)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [full, rootRef])

  useEffect(() => () => stopRef.current?.(), [])

  /* shared pointer plumbing: `move(dx, dy)` gets the distance from where the gesture started */
  const gesture = useCallback((e, move) => {
    const x0 = e.clientX
    const y0 = e.clientY
    const target = e.currentTarget
    try { target.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    const prevSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const onMove = (ev) => move(ev.clientX - x0, ev.clientY - y0)
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.style.userSelect = prevSelect
      stopRef.current = null
      const el = rootRef.current
      if (el && el.dataset.moved) {
        const r = el.getBoundingClientRect()
        saved = { left: r.left, top: r.top, width: r.width }
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    stopRef.current = stop
  }, [rootRef])

  /* drag by the title bar (buttons and links keep working as buttons) */
  const onHeadPointerDown = useCallback(
    (e) => {
      const el = rootRef.current
      if (!el || full || (e.button != null && e.button !== 0)) return
      if (e.target.closest('button, a, input')) return
      e.preventDefault()
      const r0 = el.getBoundingClientRect()
      const { vw, vh } = viewport()
      gesture(e, (dx, dy) => {
        applyBox(el, {
          width: r0.width,
          left: clamp(r0.left + dx, EDGE, vw - EDGE - r0.width),
          top: clamp(r0.top + dy, EDGE, vh - EDGE - r0.height),
        })
      })
    },
    [full, gesture, rootRef]
  )

  /* resize from a corner: corner = 'nw' | 'ne' | 'sw' | 'se'; the opposite corner stays where it is */
  const startResize = useCallback(
    (e, corner) => {
      const el = rootRef.current
      if (!el || full || (e.button != null && e.button !== 0)) return
      e.preventDefault()
      e.stopPropagation()
      const east = corner.includes('e')
      const south = corner.includes('s')
      const r0 = el.getBoundingClientRect()
      const chrome = chromeHeight(el)
      const { vw, vh } = viewport()
      const anchorX = east ? r0.left : r0.right
      const anchorY = south ? r0.top : r0.bottom
      // free room between the fixed corner and the window edge on the side we grow towards
      const lim = widthLimits(east ? vw - EDGE - anchorX : anchorX - EDGE, south ? vh - EDGE - anchorY : anchorY - EDGE, chrome)
      gesture(e, (dx, dy) => {
        // the axis the finger moved furthest decides the scale; the other dimension follows (linked)
        const sx = ((east ? dx : -dx) / r0.width)
        const sy = ((south ? dy : -dy) / r0.height)
        const s = Math.abs(sx) >= Math.abs(sy) ? sx : sy
        const width = clamp(r0.width * (1 + s), lim.min, lim.max)
        const h = heightFor(width, chrome)
        applyBox(el, { width, left: east ? anchorX : anchorX - width, top: south ? anchorY : anchorY - h })
      })
    },
    [full, gesture, rootRef]
  )

  return { onHeadPointerDown, startResize }
}
