import Link from 'next/link'
import { FOOTER_DISCLAIMER } from '@/lib/legal'

// Site-wide footer required by Disclaimer §16.1: the short-form disclaimer
// plus links to every policy. `compact` renders the in-app variant at the
// bottom of the scrollable content area; the full variant closes the public
// pages (login, legal documents).
export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={compact ? 'site-footer compact' : 'site-footer'}>
      <div className="site-footer-inner">
        <p className="site-footer-disclaimer">
          {FOOTER_DISCLAIMER} See our <Link href="/disclaimer">Investment and Trading Disclaimer</Link>.
        </p>
        <div className="site-footer-row">
          <nav className="site-footer-links" aria-label="Legal">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/disclaimer">Disclaimer</Link>
            <Link href="/refunds">Refunds</Link>
            <a href="mailto:support@strategylabai.net">Contact</a>
          </nav>
          <p className="site-footer-copy">© {new Date().getFullYear()} Strategy Lab AI · Salem, MA</p>
        </div>
      </div>
    </footer>
  )
}
