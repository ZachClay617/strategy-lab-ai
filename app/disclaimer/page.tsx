import type { Metadata } from 'next'
import LegalDoc from '@/components/LegalDoc'

export const metadata: Metadata = {
  title: 'Investment & Trading Disclaimer',
  description: 'Strategy Lab AI is an educational research tool, not an investment adviser. Read the full disclaimer.',
}
export const dynamic = 'force-static'

export default function DisclaimerPage() {
  return <LegalDoc file="disclaimer.md" />
}
