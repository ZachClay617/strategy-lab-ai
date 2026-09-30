import './globals.css'
import type { Metadata } from 'next'
import { Fredoka, Baloo_2, M_PLUS_Rounded_1c, JetBrains_Mono } from 'next/font/google'
import TradeSignalToast from './components/TradeSignalToast'
import AppShell from '@/components/AppShell'

// Soft, rounded, heavy-set type. Fredoka is the bubbliest of the three and
// carries the headings; Baloo 2 is rounded but readable at body sizes; M PLUS
// Rounded 1c has even-width digits, so money columns still line up while
// staying rounded. JetBrains Mono is kept only for the deliberate
// terminal-style A-TAMP briefing readout.
const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka', display: 'swap' })
const baloo = Baloo_2({ subsets: ['latin'], variable: '--font-baloo', display: 'swap' })
const rounded = M_PLUS_Rounded_1c({ subsets: ['latin'], weight: ['400','500','700','800','900'], variable: '--font-rounded', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'Strategy Lab AI',
    template: '%s | Strategy Lab AI',
  },
  description: 'Educational trading-strategy research tools: backtesting, portfolio tracking, company reports, and rule-based trade signals. Not investment advice.',
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" className={`${fredoka.variable} ${baloo.variable} ${rounded.variable} ${jbMono.variable}`}><body>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <AppShell>{children}</AppShell>
    <TradeSignalToast/>
  </body></html>
}
