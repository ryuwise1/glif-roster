import { describe, expect, it } from 'vitest'
import { domainMap, logoSrc, normCompany, parseDomain } from '../lib/companies'

// 모두 가짜 데이터
describe('회사 이름 맞추기', () => {
  it('공백·대소문자·(주)·㈜·주식회사는 무시한다', () => {
    expect(normCompany('㈜ 가짜 증권')).toBe(normCompany('가짜증권'))
    expect(normCompany('(주)가짜증권')).toBe(normCompany('가짜증권 주식회사'))
    expect(normCompany('Fake Bank')).toBe(normCompany('fakebank'))
  })
  it('같은 회사는 이름을 조금 다르게 적어도 같은 도메인을 찾는다', () => {
    const map = domainMap([{ company: '가짜증권', domain: 'fake-sec.example' }])
    expect(map.get(normCompany('㈜가짜 증권'))).toBe('fake-sec.example')
  })
})

describe('도메인 입력', () => {
  it('주소를 붙여 넣어도 도메인만 남긴다', () => {
    expect(parseDomain('https://www.Fake-Bank.example/ko/about?x=1')).toBe('fake-bank.example')
    expect(parseDomain(' fakebank.co.kr ')).toBe('fakebank.co.kr')
  })
  it('도메인 모양이 아니면 null', () => {
    expect(parseDomain('')).toBeNull()
    expect(parseDomain('가짜 회사')).toBeNull()
    expect(parseDomain('localhost')).toBeNull()
    expect(parseDomain('javascript:alert(1)')).toBeNull()
  })
})

describe('로고 주소', () => {
  it('키가 없으면 구글 아이콘, 있으면 logo.dev 를 쓴다', () => {
    expect(logoSrc('fakebank.example')).toBe('https://www.google.com/s2/favicons?domain=fakebank.example&sz=128')
    expect(logoSrc('fakebank.example', 'pk_test')).toBe('https://img.logo.dev/fakebank.example?token=pk_test&size=128&format=png&retina=true')
  })
})
