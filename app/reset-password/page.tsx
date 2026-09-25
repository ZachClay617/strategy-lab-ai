'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPassword(){
  const router=useRouter()
  const [ready,setReady]=useState(false)
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [msg,setMsg]=useState('')
  const [done,setDone]=useState(false)

  useEffect(()=>{
    if(!supabase)return
    const {data}=supabase.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')setReady(true)})
    supabase.auth.getSession().then(({data})=>{if(data.session)setReady(true)})
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

  return <main className="shell auth">
    <div className="brand">◈ STRATEGY LAB <em>AI</em></div>
    <section className="auth-card">
      <div className="eyebrow">ACCOUNT RECOVERY</div>
      <h1>Set a <span>new password.</span></h1>
      {!ready?<p className="muted">Open this page using the password reset link from your email.</p>:done?<p className="muted">Password updated. Redirecting you to sign in…</p>:<>
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
  </main>
}
