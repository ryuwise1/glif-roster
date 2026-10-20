import { describe, expect, it } from 'vitest'
import { nameMatches } from '../lib/approvals'

describe('nameMatches', () => {
  it('띄어쓰기만 다르면 같은 이름으로 본다', () => {
    expect(nameMatches('홍길동', '홍길동')).toBe(true)
    expect(nameMatches(' 홍 길동 ', '홍길동')).toBe(true)
  })

  it('이름·성 순서로 적힌 두 단어도 같은 이름으로 본다', () => {
    expect(nameMatches('길동 홍', '홍길동')).toBe(true)
  })

  it('글자가 다르거나 값이 비어 있으면 다른 이름이다', () => {
    expect(nameMatches('홍길순', '홍길동')).toBe(false)
    expect(nameMatches('Gildong Hong', '홍길동')).toBe(false)
    expect(nameMatches(null, '홍길동')).toBe(false)
    expect(nameMatches('홍길동', null)).toBe(false)
    expect(nameMatches('  ', ' ')).toBe(false)
  })
})
