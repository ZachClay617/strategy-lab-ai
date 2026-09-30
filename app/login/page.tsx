'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LEGAL_VERSION, SIGNUP_CONSENT_TEXT } from '@/lib/legal'
import { USERNAME_REQUIREMENTS, isValidUsername, normalizeUsername } from '@/lib/username'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/home'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [signupUsername, setSignupUsername] = useState('')
  const [signupName, setSignupName] = useState('')
  const [signupGender, setSignupGender] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)

  // Normally unreachable in practice (proxy.ts redirects a logged-in
  // visitor away from /login before this page's own code ever runs) — kept
  // as a client-side backstop for the moment right after signing in, before
  // the redirect below completes.
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace(next) })
  }, [])

  async function auth(e: React.FormEvent) {
    e.preventDefault(); setMsg('')
    if (!supabase) { setMsg('Add Supabase environment variables first.'); return }
    setBusy(true)
    try {
      if (mode === 'signup') {
        if (!consentChecked) { setMsg('Please read and accept the Terms of Service, Privacy Policy, and Investment and Trading Disclaimer to create an account.'); return }
        const username = normalizeUsername(signupUsername)
        if (!username) { setMsg('Please choose a username.'); return }
        if (!isValidUsername(username)) { setMsg(USERNAME_REQUIREMENTS); return }
        const { data: available, error: availErr } = await supabase.rpc('is_username_available', { uname: username })
        if (!availErr && available === false) { setMsg('That username is already taken.'); return }
        // The database is the source of truth for this requirement (see
        // migration_v34_require_username.sql): the signup trigger reads
        // `username` from this metadata and rejects the whole signup —
        // rolling back the auth.users row too — if it's missing, malformed,
        // or already taken, so a client-side bypass can never create an
        // account without one.
        const res = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, full_name: signupName.trim() || undefined, gender: signupGender || undefined } },
        })
        if (res.error) { setMsg(res.error.message); return }
        if (res.data.user) {
          const { error: profErr } = await supabase.from('profiles').upsert({ id: res.data.user.id, accepted_legal_at: new Date().toISOString(), accepted_legal_version: LEGAL_VERSION })
          if (profErr) { setMsg(`Account created, but we couldn't record your policy acceptance (${profErr.message}). Please contact support.`); return }
        }
        if (res.data.session) { router.push(next); return }
        setMsg('Account created. Check your email if confirmation is enabled.')
        return
      }
      // Sign-in goes through a server route so a username can be resolved to
      // its email privately (service-role lookup, rate limited, and the email
      // is never returned to the browser).
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: email, password }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) { setMsg(j?.message || j?.error || 'Sign-in failed. Please try again.'); return }
      const { error } = await supabase.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token })
      if (error) { setMsg(error.message); return }
      router.push(next)
    } catch {
      setMsg('Something went wrong. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function forgotPassword() {
    setMsg('')
    if (!supabase) { setMsg('Add Supabase environment variables first.'); return }
    if (!email.trim()) { setMsg('Enter your email or username above first, then click "Forgot password?" again.'); return }
    try {
      const r = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: email }) })
      const j = await r.json().catch(() => null)
      setMsg(j?.message || j?.error || 'If an account exists, a password reset link has been sent.')
    } catch { setMsg('Could not send the reset email. Check your connection and try again.') }
  }

  if (!supabase) return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>

  return <main className="auth">
    <div className="auth-split">
      <section className="auth-side" aria-hidden="true">
        <div>
          <div className="eyebrow">Strategy research platform</div>
          <h1>Test everything.<br/><span>Trust the out-of-sample.</span></h1>
          <p className="muted">Backtest rule-based strategies against up to ten years of real market data, track portfolios, and get alerted the moment your rules trigger. Every result is validated on data the strategy never saw.</p>
        </div>
        <div className="auth-side-stats">
          <div><span>Historical depth</span><b>10 YRS</b></div>
          <div><span>Validation</span><b>OUT-OF-SAMPLE</b></div>
          <div><span>Signal checks</span><b>24/7</b></div>
        </div>
      </section>
      <section className="auth-card">
      <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
      <p className="muted">{mode === 'login' ? 'Welcome back to the lab.' : 'Free while in early access.'}</p>
      <form onSubmit={auth} className="auth-form">
        <input type={mode === 'signup' ? 'email' : 'text'} placeholder={mode === 'signup' ? 'you@example.com' : 'Email or username'} value={email} onChange={e => setEmail(e.target.value)} aria-label={mode === 'signup' ? 'Email address' : 'Email or username'} required />
        {mode === 'signup' && <>
          <input type="text" placeholder="Name (optional)" value={signupName} onChange={e => setSignupName(e.target.value)} aria-label="Name (optional)" />
          <input type="text" placeholder="Username" value={signupUsername} onChange={e => setSignupUsername(e.target.value.replace(/\s/g, ''))} aria-label="Username" title={USERNAME_REQUIREMENTS} pattern="[A-Za-z][A-Za-z0-9_]{2,19}" minLength={3} maxLength={20} required />
          <select value={signupGender} onChange={e => setSignupGender(e.target.value)} aria-label="Gender (optional)">
            <option value="">Gender (optional)…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </>}
        <div className="password-field">
          <input type={showPassword ? 'text' : 'password'} placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} minLength={8} aria-label="Password" required />
          <button type="button" className="password-toggle" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'HIDE' : 'SHOW'}</button>
        </div>
        {mode === 'signup' && <label className="consent-check">
          <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} required />
          <span>{SIGNUP_CONSENT_TEXT} Read the <Link href="/terms" target="_blank">Terms of Service</Link>, <Link href="/privacy" target="_blank">Privacy Policy</Link>, <Link href="/disclaimer" target="_blank">Investment and Trading Disclaimer</Link>, and <Link href="/refunds" target="_blank">Refund Policy</Link>.</span>
        </label>}
        <button className="primary" disabled={busy}>{busy ? 'PLEASE WAIT…' : mode === 'login' ? 'ENTER LAB' : 'CREATE ACCOUNT'}</button>
      </form>
      <div className="auth-links">
        <button className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>
        {mode === 'login' && <button className="link" onClick={forgotPassword}>Forgot password?</button>}
      </div>
      {msg && <div className="msg" role="status">{msg}</div>}
      </section>
    </div>
  </main>
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>
}
