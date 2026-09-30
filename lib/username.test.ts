import { describe, it, expect } from 'vitest'
import { escapeLikePattern, isValidUsername, normalizeUsername, usernameMatches } from './username'

describe('isValidUsername', () => {
  it('accepts the documented format', () => {
    expect(isValidUsername('zach')).toBe(true)
    expect(isValidUsername('Zach_Clay_2007')).toBe(true)
    expect(isValidUsername('a1b')).toBe(true)
  })
  it('rejects LIKE metacharacters, so a wildcard never reaches the lookup', () => {
    expect(isValidUsername('%')).toBe(false)
    expect(isValidUsername('z%')).toBe(false)
    expect(isValidUsername('a%b')).toBe(false)
  })
  it('rejects the other malformed shapes', () => {
    expect(isValidUsername('')).toBe(false)
    expect(isValidUsername('ab')).toBe(false)
    expect(isValidUsername('1abc')).toBe(false)
    expect(isValidUsername('has space')).toBe(false)
    expect(isValidUsername('a'.repeat(21))).toBe(false)
  })
})

describe('escapeLikePattern', () => {
  it('leaves ordinary usernames alone', () => {
    expect(escapeLikePattern('zach')).toBe('zach')
  })
  it('escapes the underscore wildcard that is also a legal username character', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
    expect(escapeLikePattern('_')).toBe('\\_')
  })
  it('escapes percent and backslash too', () => {
    expect(escapeLikePattern('a%b')).toBe('a\\%b')
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
  })
})

describe('usernameMatches', () => {
  it('matches case-insensitively', () => {
    expect(usernameMatches('ZachClay', 'zachclay')).toBe(true)
  })
  it('refuses a row that is merely a pattern match', () => {
    expect(usernameMatches('axb', 'a_b')).toBe(false)
    expect(usernameMatches('someoneelse', '%')).toBe(false)
  })
  it('refuses missing values', () => {
    expect(usernameMatches(null, 'zach')).toBe(false)
    expect(usernameMatches(undefined, 'zach')).toBe(false)
  })
})

describe('normalizeUsername', () => {
  it('strips surrounding and interior whitespace', () => {
    expect(normalizeUsername('  zach  ')).toBe('zach')
    expect(normalizeUsername('za ch')).toBe('zach')
  })
})
