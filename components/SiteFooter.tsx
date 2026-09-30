import Link from 'next/link'
import { FOOTER_DISCLAIMER } from '@/lib/legal'

// Site-wide footer required by Disclaimer §16.1: the short-form disclaimer
// plus links to every policy, rendered on every page via the root layout.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-disclaimer">
          {FOOTER_DISCLAIMER} See our <Link href="/disclaimer">Investment and Trading Disclaimer</Link>.
        </p>
        <nav className="site-footer-links" aria-label="Legal">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/disclaimer">Disclaimer</Link>
          <Link href="/refunds">Refunds &amp; Cancellation</Link>
          <a href="mailto:support@strategylabai.net">Contact</a>
        </nav>
        <p className="site-footer-copy">© {new Date().getFullYear()} Strategy Lab AI · Salem, Massachusetts · Market data and AI output may be delayed, incomplete, or wrong.</p>
      </div>
    </footer>
  )
}
