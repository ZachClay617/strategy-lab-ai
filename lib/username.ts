// Single source of truth for username format on the client. The database
// enforces the identical rule (see supabase/migration_v34_require_username.sql)
// so a client bypass can never create an account with a missing or malformed
// username — the signup trigger rejects it and the whole transaction rolls
// back, including the auth.users row.
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/
export const USERNAME_REQUIREMENTS =
  'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores.'

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/\s/g, '')
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(raw)
}
