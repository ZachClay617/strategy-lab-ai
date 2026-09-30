import type { Metadata } from 'next'
import LegalDoc from '@/components/LegalDoc'

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy',
  description: 'How to cancel a Strategy Lab AI plan and when refunds apply.',
}
export const dynamic = 'force-static'

export default function RefundsPage() {
  return <LegalDoc file="refunds.md" />
}
