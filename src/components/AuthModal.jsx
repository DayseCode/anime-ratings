import { useState } from 'react'
import { supabase } from '../supabase.js'

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else onClose()
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() } },
      })
      if (error) setError(error.message)
      else if (data.session) onClose()
      else setInfo('Account created! Check your email to confirm it, then log in.')
    }
    setBusy(false)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>Your name (as in the table)</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="e.g. Віталя" />
            </>
          )}
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && <p className="error">{error}</p>}
          {info && <p className="ok">{info}</p>}
          <button className="btn primary wide" disabled={busy}>
            {busy ? '...' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p className="switch">
          {mode === 'login' ? (
            <>No account? <a onClick={() => setMode('signup')}>Sign up</a></>
          ) : (
            <>Already registered? <a onClick={() => setMode('login')}>Log in</a></>
          )}
        </p>
      </div>
    </div>
  )
}
