import { describe, it, expect } from 'vitest'
import { sanitizeStrings } from './sanitizeText'

describe('sanitizeStrings', () => {
  it('strips HTML-tag-shaped content from a plain string', () => {
    expect(sanitizeStrings('<script>alert(1)</script>hello')).toBe('alert(1)hello')
  })

  it('leaves ordinary text untouched', () => {
    expect(sanitizeStrings('Revenue grew 12% year over year.')).toBe('Revenue grew 12% year over year.')
  })

  it('recurses into arrays of strings', () => {
    expect(sanitizeStrings(['<b>bold</b>', 'plain'])).toEqual(['bold', 'plain'])
  })

  it('recurses into nested objects', () => {
    const input = { swot: { strengths: ['<img src=x onerror=alert(1)>Strong margins'] }, count: 3 }
    const out = sanitizeStrings(input)
    expect(out).toEqual({ swot: { strengths: ['Strong margins'] }, count: 3 })
  })

  it('passes non-string primitives through unchanged', () => {
    expect(sanitizeStrings(42)).toBe(42)
    expect(sanitizeStrings(null)).toBe(null)
    expect(sanitizeStrings(true)).toBe(true)
  })
})
