import './globals.css'
import type { Metadata } from 'next'
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import TradeSignalToast from './components/TradeSignalToast'
import AppShell from '@/components/AppShell'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'Strategy Lab AI',
    template: '%s | Strategy Lab AI',
  },
  description: 'Educational trading-strategy research tools: backtesting, portfolio tracking, company reports, and rule-based trade signals. Not investment advice.',
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" className={`${inter.variable} ${grotesk.variable} ${jbMono.variable}`}><body>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <AppShell>{children}</AppShell>
    <TradeSignalToast/>
  </body></html>
}
