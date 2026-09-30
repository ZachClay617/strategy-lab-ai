import './globals.css'
import type { Metadata } from 'next'
import { Nunito, Baloo_2, JetBrains_Mono } from 'next/font/google'
import TradeSignalToast from './components/TradeSignalToast'
import AppShell from '@/components/AppShell'

// Rounded, high-weight faces: Nunito carries the UI text, Baloo 2 the headings.
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' })
const baloo = Baloo_2({ subsets: ['latin'], variable: '--font-baloo', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'Strategy Lab AI',
    template: '%s | Strategy Lab AI',
  },
  description: 'Educational trading-strategy research tools: backtesting, portfolio tracking, company reports, and rule-based trade signals. Not investment advice.',
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" className={`${nunito.variable} ${baloo.variable} ${jbMono.variable}`}><body>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <AppShell>{children}</AppShell>
    <TradeSignalToast/>
  </body></html>
}
