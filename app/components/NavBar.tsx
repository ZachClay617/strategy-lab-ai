'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

  // Counts notifications still needing action (acknowledged=false) rather than
  // "created since the last time this browser visited /notifications" — that
  // per-browser timestamp lived only in localStorage, so it was missing on a
  // fresh browser/device/private window and silently fell back to counting
  // every notification ever created. This is server-side state instead, so it
  // stays accurate across relogins and devices and only drops as notifications
  // are actually confirmed or dismissed (here or via the corner toast).
  useEffect(()=>{
    if(!supabase||!userId)return
    let dead=false
    const load=async()=>{
      const {count}=await supabase!.from('trade_notifications').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('acknowledged',false)
      if(!dead)setUnreadCount(count||0)
    }
    load()
    const id=setInterval(load,15000)
    return ()=>{dead=true;clearInterval(id)}
  },[userId,pathname])

  const links:[string,string,boolean][]=[
    ['/home','Home',pathname==='/home'],
    ['/research','Research',pathname==='/research'],
    ['/portfolios','Portfolios',!!pathname?.startsWith('/portfolios')],
    ['/company-report','Reports',!!pathname?.startsWith('/company-report')],
    ['/trade-signals','Trade Signals',!!pathname?.startsWith('/trade-signals')],
    ['/notifications','Notifications',!!pathname?.startsWith('/notifications')],
    ['/account','Account',!!pathname?.startsWith('/account')],
  ]

  return <nav className="topnav" aria-label="Main navigation">
    <Link href={userId?'/home':'/login'} className="topnav-brand" aria-label="Strategy Lab AI home">
      <svg className="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="brand-grad" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stopColor="#53d6ff"/><stop offset="1" stopColor="#b394ff"/></linearGradient></defs>
        <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="6" stroke="url(#brand-grad)" strokeWidth="1.6"/>
        <path d="M6.5 14.6l3.2-3.6 2.6 2.2 4.9-5.6" stroke="url(#brand-grad)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="17.2" cy="7.6" r="1.5" fill="url(#brand-grad)"/>
      </svg>
      STRATEGY LAB <em>AI</em>
    </Link>
    <div className="topnav-links">
      {userId?links.map(([href,label,active])=>
        <Link key={href} href={href} className={active?'active':''} aria-current={active?'page':undefined}>
          {label}
          {href==='/notifications'&&unreadCount>0&&<span className="nav-badge" aria-label={`${unreadCount} unread notifications`}>{unreadCount>9?'9+':unreadCount}</span>}
        </Link>
      ):<Link href="/login" className={pathname==='/login'?'active':''} aria-current={pathname==='/login'?'page':undefined}>Sign in</Link>}
    </div>
  </nav>
}
