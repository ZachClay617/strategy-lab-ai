'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CURRENCIES } from '@/lib/currencies'

type Profile = { id:string; email:string|null; full_name:string|null; avatar_url:string|null; currency:string; username:string|null; gender:string|null }

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
  const router=useRouter()
  const [session,setSession]=useState<any>(null)
  const [profile,setProfile]=useState<Profile|null>(null)
  const [nameDraft,setNameDraft]=useState('')
  const [usernameDraft,setUsernameDraft]=useState('')
  const [avatarDraft,setAvatarDraft]=useState<string|null>(null)
  const [currencyDraft,setCurrencyDraft]=useState('USD')
  const [genderDraft,setGenderDraft]=useState('')
  const [newPassword,setNewPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [msg,setMsg]=useState('')
  const [exporting,setExporting]=useState(false)
  const [deleting,setDeleting]=useState(false)
  const [showDeleteAccount,setShowDeleteAccount]=useState(false)
  const [deleteConfirmText,setDeleteConfirmText]=useState('')
  const fileInput=useRef<HTMLInputElement>(null)

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user)loadProfile()},[session?.user?.id])

  async function loadProfile(){
    if(!supabase||!session?.user)return
    const {data,error}=await supabase.from('profiles').select('id,email,full_name,avatar_url,currency,username,gender').eq('id',session.user.id).maybeSingle()
    if(error){setMsg(`Could not load your profile: ${error.message}. Run migration_v14_profile_settings.sql, migration_v17_username_login.sql, and migration_v20_gender.sql in Supabase.`);return}
    const p=(data as Profile)||{id:session.user.id,email:session.user.email,full_name:null,avatar_url:null,currency:'USD',username:null,gender:null}
    setProfile(p);setNameDraft(p.full_name||'');setAvatarDraft(p.avatar_url);setCurrencyDraft(p.currency||'USD');setUsernameDraft(p.username||'');setGenderDraft(p.gender||'')
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

  async function saveUsername(){
    if(!supabase||!session?.user)return
    const {error}=await supabase.from('profiles').upsert({id:session.user.id,username:usernameDraft.trim()||null})
    if(error){setMsg(error.code==='23505'?'That username is already taken.':`Could not save username: ${error.message}`);return}
    setMsg('Username updated.');await loadProfile()
  }

  async function saveCurrency(){
    if(!supabase||!session?.user)return
    const {error}=await supabase.from('profiles').upsert({id:session.user.id,currency:currencyDraft})
    if(error){setMsg(`Could not save currency: ${error.message}`);return}
    setMsg('Currency preference updated.');await loadProfile()
  }

  async function saveGender(){
    if(!supabase||!session?.user)return
    const {error}=await supabase.from('profiles').upsert({id:session.user.id,gender:genderDraft||null})
    if(error){setMsg(`Could not save gender: ${error.message}`);return}
    setMsg('Gender updated.');await loadProfile()
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

  async function signOut(){
    await supabase?.auth.signOut()
    router.push('/')
  }

  // Privacy Policy §8.1 promises self-service export: pull every row this
  // user owns and hand it over as a single JSON download.
  async function exportData(){
    if(!supabase||!session?.user)return
    setExporting(true);setMsg('')
    try{
      const uid=session.user.id
      const byUser=(table:string,select='*')=>supabase!.from(table).select(select).eq('user_id',uid)
      const [profileRes,runsRes,strategiesRes,capitalRes,portfoliosRes,reportsRes,positionsRes,notificationsRes,watchlistRes]=await Promise.all([
        supabase.from('profiles').select('*').eq('id',uid).maybeSingle(),
        byUser('research_runs'),byUser('strategies'),byUser('capital_events'),
        byUser('portfolios'),byUser('company_reports'),byUser('live_positions'),
        byUser('trade_notifications'),byUser('watchlist_symbols'),
      ])
      const portfolioIds=((portfoliosRes.data||[]) as unknown as {id:string}[]).map(p=>p.id)
      const byPortfolio=(table:string)=>portfolioIds.length?supabase!.from(table).select('*').in('portfolio_id',portfolioIds).then(r=>r.data||[]):Promise.resolve([])
      const [holdings,portfolioLog,snapshots,realizedTrades]=await Promise.all([
        byPortfolio('portfolio_holdings'),byPortfolio('portfolio_log'),byPortfolio('portfolio_snapshots'),byPortfolio('portfolio_realized_trades'),
      ])
      const payload={
        exportedAt:new Date().toISOString(),
        account:{id:uid,email:session.user.email},
        profile:profileRes.data||null,
        researchRuns:runsRes.data||[],
        strategies:strategiesRes.data||[],
        capitalEvents:capitalRes.data||[],
        portfolios:portfoliosRes.data||[],
        portfolioHoldings:holdings,
        portfolioLog:portfolioLog,
        portfolioSnapshots:snapshots,
        portfolioRealizedTrades:realizedTrades,
        companyReports:reportsRes.data||[],
        livePositions:positionsRes.data||[],
        tradeNotifications:notificationsRes.data||[],
        watchlist:watchlistRes.data||[],
      }
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a');a.href=url;a.download=`strategy-lab-ai-export-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove()
      URL.revokeObjectURL(url)
      setMsg('Your data export has been downloaded.')
    }catch(e:any){setMsg(`Export failed: ${e?.message||e}`)}
    setExporting(false)
  }

  // Privacy Policy §8.1 promises self-service deletion. delete_my_account()
  // (migration v32) removes the auth user; every user table cascades from it.
  async function deleteAccount(){
    if(!supabase||!session?.user)return
    if(deleteConfirmText.trim().toUpperCase()!=='DELETE'){setMsg('Type DELETE in the confirmation box to permanently delete your account.');return}
    setDeleting(true);setMsg('')
    const {error}=await supabase.rpc('delete_my_account')
    if(error){
      setDeleting(false)
      setMsg(`Could not delete your account: ${error.message}. Run migration_v32_privacy_hardening.sql in Supabase, or email privacy@strategylabai.net and we will delete it for you within 30 days.`)
      return
    }
    await supabase.auth.signOut()
    router.push('/research')
  }

  if(!supabase)return <div className="shell"><p className="msg banner">Add Supabase environment variables first.</p></div>
  if(!session)return <div className="shell"><p className="msg banner">Log in on the <a href="/research">Research</a> page first, then come back here.</p></div>

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
        <label>Name<input value={nameDraft} onChange={e=>setNameDraft(e.target.value)} placeholder="e.g. Zach Clay"/></label>
        <button className="ghost" onClick={saveName} disabled={nameDraft===(profile?.full_name||'')}>SAVE NAME</button>

        <div className="section-label">GENDER (OPTIONAL)</div>
        <label>Only used for how we address you in greetings — you can leave it blank or remove it any time<select value={genderDraft} onChange={e=>setGenderDraft(e.target.value)}><option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option></select></label>
        <button className="ghost" onClick={saveGender} disabled={genderDraft===(profile?.gender||'')}>SAVE GENDER</button>

        <div className="section-label">USERNAME</div>
        <label>Log in with this instead of your email<input value={usernameDraft} onChange={e=>setUsernameDraft(e.target.value.replace(/\s/g,''))} placeholder="e.g. zachclay"/></label>
        <button className="ghost" onClick={saveUsername} disabled={usernameDraft===(profile?.username||'')}>SAVE USERNAME</button>
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

        <div className="section-label">SESSION</div>
        <button className="ghost" onClick={signOut}>LOG OUT</button>

        <div className="section-label">PRIVACY &amp; LEGAL</div>
        <p className="tiny">Read the <Link href="/terms">Terms of Service</Link>, <Link href="/privacy">Privacy Policy</Link>, <Link href="/disclaimer">Investment &amp; Trading Disclaimer</Link>, and <Link href="/refunds">Refund &amp; Cancellation Policy</Link>. Privacy questions: privacy@strategylabai.net.</p>
        <button className="ghost" onClick={exportData} disabled={exporting}>{exporting?'PREPARING EXPORT…':'⬇ EXPORT MY DATA (JSON)'}</button>
        <p className="tiny">Downloads a copy of everything saved to your account: profile, research runs, strategies, portfolios, reports, signals, and watchlist.</p>
        <button className="ghost danger-ghost" onClick={()=>{setShowDeleteAccount(true);setDeleteConfirmText('')}}>🗑 DELETE MY ACCOUNT</button>
        <p className="tiny">Permanently deletes your account and all saved data. This cannot be undone.</p>
      </section>
    </div>
    {showDeleteAccount&&<div className="confirm-overlay" onClick={()=>!deleting&&setShowDeleteAccount(false)}>
      <div className="confirm-card" onClick={e=>e.stopPropagation()}>
        <div className="confirm-icon">⚠</div>
        <h3>Delete your account permanently?</h3>
        <p className="muted">This immediately and permanently deletes your account and everything in it — profile, research runs, strategies, portfolios, reports, signals, notifications, and watchlist. There is no way to recover it. Consider exporting your data first.</p>
        <label>Type DELETE to confirm<input value={deleteConfirmText} onChange={e=>setDeleteConfirmText(e.target.value)} placeholder="DELETE" autoFocus/></label>
        <div className="confirm-actions">
          <button className="ghost" onClick={()=>setShowDeleteAccount(false)} disabled={deleting}>CANCEL</button>
          <button className="danger-confirm" onClick={deleteAccount} disabled={deleting||deleteConfirmText.trim().toUpperCase()!=='DELETE'}>{deleting?'DELETING…':'YES, PERMANENTLY DELETE'}</button>
        </div>
      </div>
    </div>}
  </div>
}
