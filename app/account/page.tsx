'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CURRENCIES } from '@/lib/currencies'

type Profile = { id:string; email:string|null; full_name:string|null; avatar_url:string|null; currency:string }

function resizeImageToDataUrl(file:File, size=160, quality=0.82):Promise<string>{
  return new Promise((resolve,reject)=>{
    const img=new Image()
    const reader=new FileReader()
    reader.onerror=reject
    reader.onload=()=>{
      img.onerror=reject
      img.onload=()=>{
        const canvas=document.createElement('canvas')
        canvas.width=size;canvas.height=size
        const ctx=canvas.getContext('2d')
        if(!ctx){reject(new Error('canvas unavailable'));return}
        const scale=Math.max(size/img.width,size/img.height)
        const w=img.width*scale,h=img.height*scale
        ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h)
        resolve(canvas.toDataURL('image/jpeg',quality))
      }
      img.src=reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function Account(){
  const [session,setSession]=useState<any>(null)
  const [profile,setProfile]=useState<Profile|null>(null)
  const [nameDraft,setNameDraft]=useState('')
  const [avatarDraft,setAvatarDraft]=useState<string|null>(null)
  const [currencyDraft,setCurrencyDraft]=useState('USD')
  const [newPassword,setNewPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [msg,setMsg]=useState('')
  const fileInput=useRef<HTMLInputElement>(null)

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user)loadProfile()},[session?.user?.id])

  async function loadProfile(){
    if(!supabase||!session?.user)return
    const {data,error}=await supabase.from('profiles').select('id,email,full_name,avatar_url,currency').eq('id',session.user.id).maybeSingle()
    if(error){setMsg(`Could not load your profile: ${error.message}. Run migration_v14_profile_settings.sql in Supabase.`);return}
    const p=(data as Profile)||{id:session.user.id,email:session.user.email,full_name:null,avatar_url:null,currency:'USD'}
    setProfile(p);setNameDraft(p.full_name||'');setAvatarDraft(p.avatar_url);setCurrencyDraft(p.currency||'USD')
  }

  async function onPickAvatar(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return
    if(!file.type.startsWith('image/')){setMsg('Please choose an image file.');return}
    try{const dataUrl=await resizeImageToDataUrl(file);setAvatarDraft(dataUrl)}catch{setMsg('Could not read that image.')}
  }

  async function saveAvatar(){
    if(!supabase||!session?.user)return
    const {error}=await supabase.from('profiles').upsert({id:session.user.id,avatar_url:avatarDraft})
    if(error){setMsg(`Could not save profile picture: ${error.message}`);return}
    setMsg('Profile picture updated.');await loadProfile()
  }

  async function saveName(){
    if(!supabase||!session?.user)return
    const {error}=await supabase.from('profiles').upsert({id:session.user.id,full_name:nameDraft.trim()||null})
    if(error){setMsg(`Could not save name: ${error.message}`);return}
    setMsg('Name updated.');await loadProfile()
  }

  async function saveCurrency(){
    if(!supabase||!session?.user)return
    const {error}=await supabase.from('profiles').upsert({id:session.user.id,currency:currencyDraft})
    if(error){setMsg(`Could not save currency: ${error.message}`);return}
    setMsg('Currency preference updated.');await loadProfile()
  }

  async function savePassword(){
    setMsg('')
    if(!supabase)return
    if(newPassword.length<8){setMsg('New password must be at least 8 characters.');return}
    if(newPassword!==confirmPassword){setMsg('Passwords do not match.');return}
    const {error}=await supabase.auth.updateUser({password:newPassword})
    if(error){setMsg(`Could not change password: ${error.message}`);return}
    setNewPassword('');setConfirmPassword('');setMsg('Password changed.')
  }

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  if(!session)return <div className="shell"><p className="msg banner">Log in on the <a href="/">Research</a> page first, then come back here.</p></div>

  return <div className="shell">
    <section className="hero"><div><div className="eyebrow">YOUR ACCOUNT</div><h1>Account <span>settings.</span></h1><p className="muted">Manage your profile picture, name, password, and preferred currency.</p></div></section>
    {msg&&<p className="msg banner">{msg}</p>}
    <div className="grid">
      <section className="panel">
        <div className="panel-title"><h2>PROFILE PICTURE</h2></div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div className="account-avatar">{avatarDraft?<img src={avatarDraft} alt="Profile"/>:<span>{(profile?.full_name||session.user.email||'?').charAt(0).toUpperCase()}</span>}</div>
          <div>
            <button className="ghost" onClick={()=>fileInput.current?.click()}>CHOOSE IMAGE</button>
            <input ref={fileInput} type="file" accept="image/*" onChange={onPickAvatar} style={{display:'none'}}/>
          </div>
        </div>
        <button className="run" onClick={saveAvatar} disabled={avatarDraft===profile?.avatar_url}>SAVE PICTURE</button>

        <div className="section-label">NAME</div>
        <label>Display name<input value={nameDraft} onChange={e=>setNameDraft(e.target.value)} placeholder="e.g. Zach Clay"/></label>
        <button className="ghost" onClick={saveName} disabled={nameDraft===(profile?.full_name||'')}>SAVE NAME</button>
      </section>

      <section className="panel">
        <div className="panel-title"><h2>PASSWORD</h2></div>
        <label>New password<div className="password-field"><input type={showPassword?'text':'password'} value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} placeholder="8+ characters"/><button type="button" className="password-toggle" onClick={()=>setShowPassword(s=>!s)}>{showPassword?'HIDE':'SHOW'}</button></div></label>
        <label>Confirm new password<input type={showPassword?'text':'password'} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} placeholder="Repeat password"/></label>
        <button className="run" onClick={savePassword} disabled={!newPassword||!confirmPassword}>CHANGE PASSWORD</button>

        <div className="section-label">CURRENCY</div>
        <label>Preferred currency<select value={currencyDraft} onChange={e=>setCurrencyDraft(e.target.value)}>{CURRENCIES.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
        <button className="ghost" onClick={saveCurrency} disabled={currencyDraft===(profile?.currency||'USD')}>SAVE CURRENCY</button>
        <p className="tiny">This sets your preferred currency for display. Prices and balances are currently sourced and shown in USD; live currency conversion across the app is planned for a future update.</p>

        <div className="section-label">EMAIL</div>
        <p className="muted">{session.user.email}</p>
      </section>
    </div>
  </div>
}
