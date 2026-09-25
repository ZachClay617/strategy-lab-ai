'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavBar(){
  const pathname=usePathname()
  return <nav className="topnav">
    <Link href="/" className={pathname==='/'?'active':''}>Research</Link>
    <Link href="/portfolios" className={pathname?.startsWith('/portfolios')?'active':''}>Portfolios</Link>
  </nav>
}
