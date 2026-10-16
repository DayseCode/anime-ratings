import { useState } from 'react'

/* Shows /icons/player/<name>.svg  (files live in  public/icons/player/ ).
   If the file does not exist yet, the plain-text fallback is shown instead,
   so the player keeps working while you add your own icons one by one. */
export default function Icon({ name, fallback = '' }) {
  const [failed, setFailed] = useState(null)
  if (failed === name) return fallback ? <span className="ico-fallback">{fallback}</span> : null
  return (
    <img
      className="ico"
      src={`${import.meta.env.BASE_URL}icons/player/${name}.svg`}
      alt=""
      draggable="false"
      onError={() => setFailed(name)}
    />
  )
}
