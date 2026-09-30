import { createClient } from '@supabase/supabase-js'

// Verifies the Supabase access token a client sends in
// `Authorization: Bearer <token>` and returns the authenticated user id, or
// null. Used by the API routes that spend paid AI/data resources, so an
// anonymous curl can no longer burn credits — every call must belong to a
// real signed-in account (and can then be rate-limited per user, not just
// per IP).
export async function verifyUser(req: { headers: { get(name: string): string | null } }): Promise<{ userId: string } | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !anonKey) return null
  try {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null
    return { userId: data.user.id }
  } catch {
    return null
  }
}

export const AUTH_REQUIRED_MESSAGE = 'Sign in to use this feature.'
