// Cookie-based (not localStorage-based) browser client — this is what lets
// proxy.ts (this app's middleware) read the same session server-side, before
// any page renders, so a logged-out visit to a protected page is redirected
// before its content is ever sent to the browser instead of flashing then
// hiding it. It is also what lets cookie-authenticated API routes such as
// /api/market verify the caller without the page attaching a bearer token.
import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key ? createBrowserClient(url, key) : null
