import './globals.css'
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import NavBar from './components/NavBar'
import TradeSignalToast from './components/TradeSignalToast'

export const metadata: Metadata = {
  title: {
    default: 'Strategy Lab AI',
    template: '%s | Strategy Lab AI',
  },
  description: 'AI-powered trading strategy research laboratory',
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>
    <NavBar/>
    {children}
    <TradeSignalToast/>
    <Analytics />
  </body></html>
}
