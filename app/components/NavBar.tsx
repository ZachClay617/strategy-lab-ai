'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavBar(){
  const pathname=usePathname()
  return <nav className="topnav">
    <Link href="/home" className="topnav-brand">◈ STRATEGY LAB <em>AI</em></Link>
    <div className="topnav-links">
      <Link href="/home" className={pathname==='/home'?'active':''}>Home</Link>
      <Link href="/research" className={pathname==='/research'?'active':''}>Research</Link>
      <Link href="/portfolios" className={pathname?.startsWith('/portfolios')?'active':''}>Portfolios</Link>
      <Link href="/company-report" className={pathname?.startsWith('/company-report')?'active':''}>Reports</Link>
      <Link href="/account" className={pathname?.startsWith('/account')?'active':''}>Account</Link>
    </div>
  </nav>
}
