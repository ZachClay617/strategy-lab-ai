'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { updateProfile } from '@/lib/profile'
import { LEGAL_VERSION, SIGNUP_CONSENT_TEXT } from '@/lib/legal'

// Blocking consent gate for signed-in users. The signup form already
// requires the 18+/terms checkbox, but that alone leaves two holes: an
// account created by calling the auth API directly never saw the checkbox,
// and accounts created before the checkbox existed have no recorded
// acceptance. This gate closes both — any signed-in account whose recorded
// acceptance is missing or belongs to an older document version cannot use
// the app until it accepts the current version (recorded with a timestamp),
// or signs out. Bumping LEGAL_VERSION in lib/legal.ts after a material
// document change automatically re-prompts every existing user.
export default function LegalGate({ userId }: { userId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'needed'>('loading')
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!supabase || !userId) return
    let dead = false
    supabase.from('profiles').select('accepted_legal_version').eq('id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (dead) return
        // On a read error, fail open rather than lock the user out of their
        // account over a transient fault — the next page load re-checks.
        if (error) { setState('ok'); return }
        setState(data?.accepted_legal_version === LEGAL_VERSION ? 'ok' : 'needed')
      })
    return () => { dead = true }
  }, [userId])

  async function accept() {
    if (!supabase || !checked) return
    setSaving(true); setErr('')
    const { error } = await updateProfile(supabase, userId, {
      accepted_legal_at: new Date().toISOString(),
      accepted_legal_version: LEGAL_VERSION,
    })
    setSaving(false)
    if (error) { setErr(`Could not save your acceptance: ${error.message}`); return }
    setState('ok')
  }

  async function signOut() {
    await supabase?.auth.signOut()
    window.location.href = '/login'
  }

  if (state !== 'needed') return null

  return <div className="gate-overlay" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
    <div className="gate-card">
      <h2 id="legal-gate-title">Before you continue</h2>
      <p className="muted">Our terms were updated (version {LEGAL_VERSION}), or your account has not yet recorded acceptance. Please review and accept to keep using Strategy Lab AI.</p>
      <label className="consent-check">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
        <span>{SIGNUP_CONSENT_TEXT} Read the <Link href="/terms" target="_blank">Terms of Service</Link>, <Link href="/privacy" target="_blank">Privacy Policy</Link>, <Link href="/disclaimer" target="_blank">Investment and Trading Disclaimer</Link>, and <Link href="/refunds" target="_blank">Refund Policy</Link>.</span>
      </label>
      {err && <p className="msg">{err}</p>}
      <div className="gate-actions">
        <button className="ghost" onClick={signOut} disabled={saving}>Sign out</button>
        <button className="primary" style={{ marginTop: 0, width: 'auto', flex: 1 }} onClick={accept} disabled={!checked || saving}>{saving ? 'Saving…' : 'I agree — continue'}</button>
      </div>
    </div>
  </div>
}
