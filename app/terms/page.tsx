import type { Metadata } from 'next'
import LegalDoc from '@/components/LegalDoc'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Strategy Lab AI.',
}
export const dynamic = 'force-static'

export default function TermsPage() {
  return <LegalDoc file="terms.md" />
}
