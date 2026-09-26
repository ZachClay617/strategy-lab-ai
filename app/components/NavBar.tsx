'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function NavBar(){
  const pathname=usePathname()
  const [session,setSession]=useState<any>(null)
  const [avatarUrl,setAvatarUrl]=useState<string|null>(null)

  useEffect(()=>{
    if(!supabase)return
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>data.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!supabase||!session?.user){setAvatarUrl(null);return}
    let dead=false
    supabase.from('profiles').select('avatar_url').eq('id',session.user.id).maybeSingle().then(({data})=>{
      if(!dead)setAvatarUrl(data?.avatar_url||null)
    })
    return ()=>{dead=true}
  },[session?.user?.id])

  return <nav className="topnav">
    <Link href="/home" className="topnav-brand">◈ STRATEGY LAB <em>AI</em></Link>
    <div className="topnav-links">
      <Link href="/home" className={pathname==='/home'?'active':''}>Home</Link>
      <Link href="/research" className={pathname==='/research'?'active':''}>Research</Link>
      <Link href="/portfolios" className={pathname?.startsWith('/portfolios')?'active':''}>Portfolios</Link>
      <Link href="/company-report" className={pathname?.startsWith('/company-report')?'active':''}>Reports</Link>
    </div>
    {session?.user&&<Link href="/account" className="account-pill" title="Account settings">
      {avatarUrl?<img src={avatarUrl} alt="Account"/>:<span>{(session.user.email||'?').charAt(0).toUpperCase()}</span>}
    </Link>}
  </nav>
}
