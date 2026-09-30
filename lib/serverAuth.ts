import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

// Verifies the caller is a logged-in Supabase user by checking the bearer
// access token they send, using the same public anon/publishable key the
// browser already uses — never the service-role key — so this can only
// confirm "this token belongs to a real logged-in user," never bypass RLS
// or act on anyone's behalf.
export async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
