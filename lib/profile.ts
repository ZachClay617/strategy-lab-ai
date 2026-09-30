import type { SupabaseClient } from '@supabase/supabase-js'

// Every profile write in the app used to be `.upsert({id, ...oneOrTwoColumns})`.
// That is not a safe way to change a few columns of an existing row: PostgREST
// turns it into `INSERT ... ON CONFLICT (id) DO UPDATE SET <given columns>`,
// and Postgres validates NOT NULL/CHECK constraints against the *candidate
// insert row* before it ever looks for the conflict. Since
// migration_v34_require_username made profiles.username NOT NULL with no
// default, a patch that doesn't mention username is a null-violation — so
// saving a display name, avatar, currency, gender, research balance, or legal
// acceptance would fail for every user, including the one write that gets a
// brand-new account past the legal gate.
//
// The signup trigger (also v34) creates the profile row in the same
// transaction as the auth user, so the row is guaranteed to exist by the time
// any of this runs and a plain UPDATE is both correct and sufficient.
export type ProfilePatch = Record<string, unknown>

// `code` is carried through because callers branch on Postgres error codes —
// e.g. 23505 (unique violation) becomes "that username is already taken".
export type ProfileWriteError = { message: string; code?: string }
export type ProfileWriteResult = { error: ProfileWriteError | null }

const MISSING_ROW: ProfileWriteError = {
  message: 'Your profile record could not be found. Please sign out, sign back in, and try again.',
}

export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  patch: ProfilePatch,
): Promise<ProfileWriteResult> {
  // .select() so a patch that matched no row is reported instead of looking
  // like a silent success — an UPDATE that hits zero rows is not an error to
  // Postgres, but it is one to the person who just pressed Save.
  const { data, error } = await client.from('profiles').update(patch).eq('id', userId).select('id').maybeSingle()
  if (error) return { error: { message: error.message, code: error.code } }
  if (!data) return { error: MISSING_ROW }
  return { error: null }
}
