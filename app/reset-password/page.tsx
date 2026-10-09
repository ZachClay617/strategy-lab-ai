'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { readRecoveryLink, EXPIRED_LINK_MESSAGE } from '@/lib/recoveryLink'

export default function ResetPassword(){
  const router=useRouter()
  const [ready,setReady]=useState(false)
  const [checking,setChecking]=useState(true)
  const [linkError,setLinkError]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [msg,setMsg]=useState('')
  const [done,setDone]=useState(false)

  useEffect(()=>{
    if(!supabase)return
    const client=supabase
    const {data}=client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')setReady(true)})
    // The browser client won't take the session from an implicit-flow reset
    // link on its own (see lib/recoveryLink.ts), so establish it here.
    const link=readRecoveryLink(window.location.href)
    // Take the one-time tokens out of the address bar and browser history.
    if(link.kind!=='none')window.history.replaceState(null,'',window.location.pathname)
    async function applyLink(){
      if(link.kind==='error')return link.message
      if(link.kind==='none'){
        // No link: a signed-in user can still change their password here.
        const {data}=await client.auth.getSession()
        if(data.session)setReady(true)
        return ''
      }
      const {error}=link.kind==='tokens'
        ?await client.auth.setSession({access_token:link.accessToken,refresh_token:link.refreshToken})
        :link.kind==='code'
          ?await client.auth.exchangeCodeForSession(link.code)
          :await client.auth.verifyOtp({token_hash:link.tokenHash,type:'recovery'})
      if(error)return EXPIRED_LINK_MESSAGE
      setReady(true)
      return ''
    }
    applyLink().then(err=>{if(err)setLinkError(err);setChecking(false)})
    return()=>data.subscription.unsubscribe()
  },[])

  async function submit(e:React.FormEvent){
    e.preventDefault();setMsg('')
    if(!supabase)return
    if(password.length<8){setMsg('Password must be at least 8 characters.');return}
    if(password!==confirm){setMsg('Passwords do not match.');return}
    const {error}=await supabase.auth.updateUser({password})
    if(error){setMsg(error.message);return}
    setDone(true)
    setTimeout(()=>router.push('/'),2000)
  }

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>

  return <main className="auth">
    <div className="auth-split" style={{gridTemplateColumns:'1fr',maxWidth:560}}>
    <section className="auth-card">
      <div className="eyebrow" style={{marginBottom:10}}>Account recovery</div>
      <h2>Set a new password</h2>
      {!ready?(checking?<p className="muted">Checking your reset link…</p>:linkError?<><p className="muted">{linkError}</p><p><a href="/login">Back to sign in</a></p></>:<p className="muted">Open this page using the password reset link from your email.</p>):done?<p className="muted">Password updated. Taking you to your account…</p>:<>
        <p className="muted">Choose a new password for your account.</p>
        <form onSubmit={submit} className="auth-form">
          <div className="password-field">
            <input type={showPassword?'text':'password'} placeholder="New password (8+ characters)" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/>
            <button type="button" className="password-toggle" onClick={()=>setShowPassword(s=>!s)}>{showPassword?'HIDE':'SHOW'}</button>
          </div>
          <input type={showPassword?'text':'password'} placeholder="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required/>
          <button className="primary">SET NEW PASSWORD</button>
        </form>
      </>}
      {msg&&<div className="msg">{msg}</div>}
    </section>
    </div>
  </main>
}
