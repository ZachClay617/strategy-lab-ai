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

// Usernames are matched case-insensitively, which means an ILIKE lookup — and
// in a LIKE pattern "_" is a single-character wildcard and "%" matches
// anything. "_" is a legal username character, so `a_b` typed at the login box
// would otherwise also match the account `axb`; a "%" smuggled past the format
// check would match the first account in the table. isValidUsername() already
// rejects "%", and this makes the remaining "_" literal.
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, m => '\\' + m)
}

// True only when this row really is the account that was asked for, whatever
// the database's pattern matching decided. Belt and braces behind the two
// guards above.
export function usernameMatches(candidate: string | null | undefined, asked: string): boolean {
  return typeof candidate === 'string' && candidate.toLowerCase() === asked.toLowerCase()
}
