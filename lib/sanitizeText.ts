// Defense-in-depth for AI-generated text: strips HTML-tag-shaped substrings
// before AI output leaves the server. Plain JSX text rendering already
// escapes these characters, so this changes nothing about how any field
// displays today — it just means a future change (a markdown renderer, a
// dangerouslySetInnerHTML call) can't turn model output into live HTML.
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

export function sanitizeStrings<T>(value: T): T {
  if (typeof value === 'string') return stripHtml(value) as unknown as T
  if (Array.isArray(value)) return value.map(sanitizeStrings) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeStrings(v)
    return out as T
  }
  return value
}
