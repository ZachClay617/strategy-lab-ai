import { describe, it, expect } from 'vitest'
import { safeNextPath } from './safeNext'

describe('safeNextPath', () => {
  it('keeps ordinary same-origin paths', () => {
    expect(safeNextPath('/portfolios')).toBe('/portfolios')
    expect(safeNextPath('/research?tab=runs')).toBe('/research?tab=runs')
    expect(safeNextPath('/company-report#top')).toBe('/company-report#top')
  })

  it('falls back when nothing was asked for', () => {
    expect(safeNextPath(null)).toBe('/home')
    expect(safeNextPath(undefined)).toBe('/home')
    expect(safeNextPath('')).toBe('/home')
  })

  it('rejects absolute URLs to other origins', () => {
    expect(safeNextPath('https://evil.example/login')).toBe('/home')
    expect(safeNextPath('http://evil.example')).toBe('/home')
    expect(safeNextPath('javascript:alert(1)')).toBe('/home')
  })

  it('rejects protocol-relative and backslash forms browsers treat as external', () => {
    expect(safeNextPath('//evil.example')).toBe('/home')
    expect(safeNextPath('//evil.example/login?expired=1')).toBe('/home')
    expect(safeNextPath('/\\evil.example')).toBe('/home')
  })

  it('rejects paths carrying control characters', () => {
    expect(safeNextPath('/\tevil')).toBe('/home')
    expect(safeNextPath('/\nhome')).toBe('/home')
  })

  it('honours a caller-supplied fallback', () => {
    expect(safeNextPath('https://evil.example', '/login')).toBe('/login')
  })
})
