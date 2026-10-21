/* Colour themes ("skins"). Each one is a full stylesheet in public/themes/<id>.css that already
   contains its own dark + light variants (the sun / moon button still switches those).
   Only the chosen skin is ever downloaded, so the others cost nothing.
   index.html applies the saved skin before the first paint (same ids + font URLs there). */
export const SKIN_VERSION = '3' // bump when you edit a theme file, so browsers fetch the new one
export const DEFAULT_SKIN = 'sakura'

const G = 'https://fonts.googleapis.com/css2?family='
export const SKINS = [
  { id: 'sakura', name: 'Sakura', dots: ['#100f1c', '#f478b8', '#5ce5ce'], font: null },
  { id: 'purple', name: 'Purple Dark', dots: ['#090b11', '#7886ff', '#9a6bff'], font: `${G}Inter:wght@400;500;600;700;800&display=swap` },
  { id: 'calm', name: 'Calm Bright', dots: ['#0d0a1a', '#8a68ff', '#ff7eb6'], font: `${G}Onest:wght@400;500;600;700;800&display=swap` },
  { id: 'neon', name: 'Neon Party', dots: ['#0b0920', '#ff79b6', '#62f0d2'], font: `${G}Onest:wght@400;500;600;700&family=Unbounded:wght@500;600&display=swap` },
]

export const isSkin = (id) => SKINS.some((s) => s.id === id)

const addLink = (href, id) => {
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = href
  if (id) l.id = id
  document.head.appendChild(l)
  return l
}

/* Swap the theme stylesheet without a flash: the new file is added first,
   the old one is removed only after the new one has loaded. */
export function applySkin(id) {
  const root = document.documentElement
  if (!isSkin(id) || root.dataset.skin === id) return
  const skin = SKINS.find((s) => s.id === id)
  const old = document.getElementById('skin-css')
  const link = addLink(`/themes/${id}.css?v=${SKIN_VERSION}`)
  link.onload = () => {
    old?.remove()
    link.id = 'skin-css'
    root.dataset.skin = id
  }
  link.onerror = () => link.remove() // keep the current look if the file cannot be loaded
  // fonts are loaded in the background (media trick = never blocks rendering)
  document.getElementById('skin-font')?.remove()
  if (skin.font) {
    const f = addLink(skin.font, 'skin-font')
    f.media = 'print'
    f.onload = () => { f.media = 'all' }
  }
}
