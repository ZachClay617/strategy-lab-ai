'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SiteFooter from '@/components/SiteFooter'
import LegalGate from '@/components/LegalGate'
import { HomeIcon, ResearchIcon, PortfolioIcon, ReportIcon, SignalIcon, BellIcon, UserIcon, SignOutIcon, LogoMark } from '@/components/navIcons'

// Application chrome: fixed left sidebar + header bar for signed-in pages,
// a minimal public header for /login, /reset-password and the legal pages,
// and an icon-only bottom navigation on small screens.

const PUBLIC_PATHS = new Set(['/', '/login', '/reset-password', '/terms', '/privacy', '/disclaimer', '/refunds'])

const NAV = [
  { href: '/home', label: 'Overview', icon: HomeIcon },
  { href: '/research', label: 'Research', icon: ResearchIcon },
  { href: '/portfolios', label: 'Portfolios', icon: PortfolioIcon },
  { href: '/company-report', label: 'Reports', icon: ReportIcon },
  { href: '/trade-signals', label: 'Signals', icon: SignalIcon },
  { href: '/notifications', label: 'Inbox', icon: BellIcon },
  { href: '/account', label: 'Account', icon: UserIcon },
] as const

const PAGE_TITLES: Record<string, string> = {
  '/home': 'Overview', '/research': 'Strategy research', '/portfolios': 'Portfolios',
  '/company-report': 'Company reports', '/trade-signals': 'Trade signals',
  '/notifications': 'Inbox', '/account': 'Account settings',
}

// Rough NYSE core session: Mon–Fri 9:30–16:00 ET (holidays not modeled).
function marketState(now: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const parts: Record<string, string> = {}
  fmt.formatToParts(now).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value })
  const mins = (+parts.hour % 24) * 60 + +parts.minute
  const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun'
  const open = !weekend && mins >= 570 && mins < 960
  return { open, clock: `${parts.hour}:${parts.minute}` }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setUserId(data.session?.user?.id || null); setEmail(data.session?.user?.email || null) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setUserId(s?.user?.id || null); setEmail(s?.user?.email || null) })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !userId) { setAvatarUrl(null); return }
    let dead = false
    supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (!dead) setAvatarUrl(data?.avatar_url || null) })
    return () => { dead = true }
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) { setUnread(0); return }
    let dead = false
    const load = async () => {
      const { count } = await supabase!.from('trade_notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('acknowledged', false)
      if (!dead) setUnread(count || 0)
    }
    load()
    const id = setInterval(load, 15000)
    return () => { dead = true; clearInterval(id) }
  }, [userId, pathname])

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  async function signOut() {
    await supabase?.auth.signOut()
    window.location.href = '/login'
  }

  const isPublic = PUBLIC_PATHS.has(pathname)
  if (isPublic || !userId) {
    return <>
      <header className="pub-header">
        <Link href={userId ? '/home' : '/login'} className="pub-brand" aria-label="Strategy Lab AI">
          <LogoMark /> <span>STRATEGY LAB<em>/AI</em></span>
        </Link>
        {!userId && pathname !== '/login' && <Link href="/login" className="pub-signin">Sign in</Link>}
        {userId && <Link href="/home" className="pub-signin">Open app</Link>}
      </header>
      <div id="main-content">{children}</div>
      <SiteFooter />
    </>
  }

  const mkt = now ? marketState(now) : null
  const title = PAGE_TITLES[Object.keys(PAGE_TITLES).find(p => pathname.startsWith(p)) || ''] || 'Strategy Lab'

  return <div className="app">
    <LegalGate userId={userId} />
    <aside className="sidebar">
      <Link href="/home" className="side-brand" aria-label="Strategy Lab AI — overview">
        <LogoMark /> <span>STRATEGY LAB<em>/AI</em></span>
      </Link>
      <nav className="side-nav" aria-label="Main navigation">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return <Link key={href} href={href} className={`side-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
            {href === '/notifications' && unread > 0 && <span className="side-badge" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}
          </Link>
        })}
      </nav>
      <div className="side-foot">
        <Link href="/account" className="side-account" aria-label="Account settings">
          <span className="side-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : (email || '?').charAt(0).toUpperCase()}</span>
          <span className="side-email">{email}</span>
        </Link>
        <button className="side-signout" onClick={signOut} aria-label="Sign out" title="Sign out"><SignOutIcon /></button>
      </div>
    </aside>

    <div className="app-main">
      <header className="app-header">
        <div className="app-header-title">
          <h1>{title}</h1>
        </div>
        <div className="app-header-tools">
          {mkt && <span className="mkt-chip" title="New York market session">
            <i className={`mkt-dot ${mkt.open ? 'open' : ''}`} aria-hidden="true" />
            {mkt.open ? 'MARKET OPEN' : 'MARKET CLOSED'} · {mkt.clock} ET
          </span>}
          <Link href="/notifications" className="hdr-bell" aria-label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}>
            <BellIcon />
            {unread > 0 && <span className="hdr-bell-badge">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </div>
      </header>
      <main id="main-content" className="app-content">
        {children}
        <SiteFooter compact />
      </main>
    </div>

    <nav className="tabbar" aria-label="Main navigation">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return <Link key={href} href={href} className={`tab-link${active ? ' active' : ''}`} aria-label={label} aria-current={active ? 'page' : undefined}>
          <Icon size={20} />
          {href === '/notifications' && unread > 0 && <span className="side-badge tab-badge">{unread > 9 ? '9+' : unread}</span>}
        </Link>
      })}
    </nav>
  </div>
}
