import type { Metadata } from 'next'
import LegalDoc from '@/components/LegalDoc'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Strategy Lab AI collects, uses, and protects your information.',
}
export const dynamic = 'force-static'

export default function PrivacyPage() {
  return <LegalDoc file="privacy.md" />
}
