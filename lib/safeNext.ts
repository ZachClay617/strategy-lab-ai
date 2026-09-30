// `?next=` decides where sign-in sends you, and it comes from the URL, so a
// link like /login?next=https://lookalike.example would put a convincing
// "session expired, sign in again" page in front of someone who just typed
// their real password into the genuine site. Only a plain same-origin path is
// ever honoured.
//
// Rejected: anything not starting with "/" (absolute URLs, "javascript:"),
// "//host" and "/\host" (both of which browsers resolve to another origin),
// and control characters, which some parsers strip before resolving the URL.
const DEFAULT_NEXT = '/home'

export function safeNextPath(raw: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!raw) return fallback
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
