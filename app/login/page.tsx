'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/home'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [msg, setMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [signupUsername, setSignupUsername] = useState('')
  const [signupName, setSignupName] = useState('')
  const [signupGender, setSignupGender] = useState('')

  // Normally unreachable in practice (proxy.ts redirects a logged-in
  // visitor away from /login before this page's own code ever runs) — kept
  // as a client-side backstop for the moment right after signing in, before
  // the redirect below completes.
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace(next) })
  }, [])

  async function resolveLoginEmail(identifier: string): Promise<{ email?: string; error?: string }> {
    const id = identifier.trim()
    if (id.includes('@')) return { email: id }
    const { data, error } = await supabase!.rpc('get_email_for_username', { uname: id })
    if (error) return { error: error.message }
    if (!data) return { error: 'No account found with that username.' }
    return { email: data as string }
  }

  async function auth(e: React.FormEvent) {
    e.preventDefault(); setMsg('')
    if (!supabase) { setMsg('Add Supabase environment variables first.'); return }
    if (mode === 'signup') {
      if (!signupName.trim()) { setMsg('Enter your name.'); return }
      if (!signupUsername.trim()) { setMsg('Choose a username.'); return }
      if (!signupGender) { setMsg('Select your gender.'); return }
      const res = await supabase.auth.signUp({ email, password })
      if (res.error) { setMsg(res.error.message); return }
      if (res.data.user) {
        const { error: profErr } = await supabase.from('profiles').upsert({ id: res.data.user.id, username: signupUsername.trim(), full_name: signupName.trim(), gender: signupGender })
        if (profErr) { setMsg(`Account created, but your profile details could not be saved (${profErr.message}). You can set them later in Account settings.`); return }
      }
      if (res.data.session) { router.push(next); return }
      setMsg('Account created. Check your email if confirmation is enabled.')
      return
    }
    const resolved = await resolveLoginEmail(email)
    if (resolved.error) { setMsg(resolved.error); return }
    const res = await supabase.auth.signInWithPassword({ email: resolved.email!, password })
    if (res.error) { setMsg(res.error.message); return }
    router.push(next)
  }

  async function forgotPassword() {
    setMsg('')
    if (!supabase) { setMsg('Add Supabase environment variables first.'); return }
    if (!email.trim()) { setMsg('Enter your email or username above first, then click "Forgot password?" again.'); return }
    const resolved = await resolveLoginEmail(email)
    if (resolved.error) { setMsg(resolved.error); return }
    const { error } = await supabase.auth.resetPasswordForEmail(resolved.email!, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) { setMsg(error.message); return }
    setMsg('Password reset email sent. Check your inbox for a link to set a new password.')
  }

  if (!supabase) return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>

  return <main className="shell auth">
    <section className="auth-card">
      <div className="eyebrow">PERSISTENT RESEARCH PLATFORM</div>
      <h1>Find strategies. <span>Test everything.</span></h1>
      <p className="muted">Accounts and research data are stored in Supabase. Sessions persist across reloads and devices.</p>
      <form onSubmit={auth} className="auth-form">
        <input type={mode === 'signup' ? 'email' : 'text'} placeholder={mode === 'signup' ? 'you@example.com' : 'Email or username'} value={email} onChange={e => setEmail(e.target.value)} required />
        {mode === 'signup' && <>
          <input type="text" placeholder="Name" value={signupName} onChange={e => setSignupName(e.target.value)} required />
          <input type="text" placeholder="Username" value={signupUsername} onChange={e => setSignupUsername(e.target.value.replace(/\s/g, ''))} required />
          <select value={signupGender} onChange={e => setSignupGender(e.target.value)} required>
            <option value="" disabled>Gender…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </>}
        <div className="password-field">
          <input type={showPassword ? 'text' : 'password'} placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
          <button type="button" className="password-toggle" onClick={() => setShowPassword(s => !s)}>{showPassword ? 'HIDE' : 'SHOW'}</button>
        </div>
        <button className="primary">{mode === 'login' ? 'ENTER LAB' : 'CREATE ACCOUNT'}</button>
      </form>
      <div className="auth-links">
        <button className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>
        {mode === 'login' && <button className="link" onClick={forgotPassword}>Forgot password?</button>}
      </div>
      {msg && <div className="msg">{msg}</div>}
    </section>
  </main>
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>
}
