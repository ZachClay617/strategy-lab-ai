'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const SEEN_KEY='notificationsSeenAt'

export default function NavBar(){
  const pathname=usePathname()
  const [userId,setUserId]=useState<string|null>(null)
  const [unreadCount,setUnreadCount]=useState(0)

  useEffect(()=>{
    if(!supabase)return
    supabase.auth.getSession().then(({data})=>setUserId(data.session?.user?.id||null))
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setUserId(s?.user?.id||null))
    return ()=>data.subscription.unsubscribe()
  },[])

  // Visiting the Notifications page marks everything seen so far — the badge
  // reappears only once a new notification arrives after that.
  useEffect(()=>{
    if(!pathname?.startsWith('/notifications'))return
    localStorage.setItem(SEEN_KEY,new Date().toISOString())
    setUnreadCount(0)
  },[pathname])

  useEffect(()=>{
    if(!supabase||!userId||pathname?.startsWith('/notifications'))return
    let dead=false
    const load=async()=>{
      const seenAt=localStorage.getItem(SEEN_KEY)||new Date(0).toISOString()
      const {count}=await supabase!.from('trade_notifications').select('id',{count:'exact',head:true}).eq('user_id',userId).gt('created_at',seenAt)
      if(!dead)setUnreadCount(count||0)
    }
    load()
    const id=setInterval(load,15000)
    return ()=>{dead=true;clearInterval(id)}
  },[userId,pathname])

  return <nav className="topnav">
    <Link href="/home" className="topnav-brand">◈ STRATEGY LAB <em>AI</em></Link>
    <div className="topnav-links">
      <Link href="/home" className={pathname==='/home'?'active':''}>Home</Link>
      <Link href="/research" className={pathname==='/research'?'active':''}>Research</Link>
      <Link href="/portfolios" className={pathname?.startsWith('/portfolios')?'active':''}>Portfolios</Link>
      <Link href="/company-report" className={pathname?.startsWith('/company-report')?'active':''}>Reports</Link>
      <Link href="/trade-signals" className={pathname?.startsWith('/trade-signals')?'active':''}>Trade Signals</Link>
      <Link href="/notifications" className={pathname?.startsWith('/notifications')?'active':''}>Notifications{unreadCount>0&&<span className="nav-badge">{unreadCount>9?'9+':unreadCount}</span>}</Link>
      <Link href="/account" className={pathname?.startsWith('/account')?'active':''}>Account</Link>
    </div>
  </nav>
}
