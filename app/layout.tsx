import './globals.css'
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import NavBar from './components/NavBar'
import TradeSignalToast from './components/TradeSignalToast'
import SiteFooter from '@/components/SiteFooter'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'Strategy Lab AI',
    template: '%s | Strategy Lab AI',
  },
  description: 'Educational trading-strategy research tools: backtesting, portfolio tracking, company reports, and rule-based trade signals. Not investment advice.',
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" className={`${inter.variable} ${jbMono.variable}`}><body>
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <NavBar/>
    <div id="main-content">
      {children}
    </div>
    <SiteFooter/>
    <TradeSignalToast/>
  </body></html>
}
