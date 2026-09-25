import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Strategy Lab AI',
  description: 'AI-powered trading strategy research laboratory',
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>
}
