import { describe, expect, it } from 'vitest'
import { domainMap, googleIconUrls, icoWidth, iconInfo, iconLinks, jpegWidth, logoSrc, normCompany, parseDomain, pngWidth } from '../lib/companies'

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
  it('키가 없으면 우리 서버의 /api/logo, 있으면 logo.dev 를 쓴다', () => {
    expect(logoSrc('fakebank.example', '')).toBe('/api/logo/fakebank.example?v=2')
    expect(logoSrc('fakebank.example', 'pk_test')).toBe(
      'https://img.logo.dev/fakebank.example?token=pk_test&size=128&format=png&retina=true&fallback=404',
    )
  })
  it('서버는 구글 아이콘을 맨 도메인, www. 순으로 본다', () => {
    expect(googleIconUrls('fakebank.example')).toEqual([
      'https://www.google.com/s2/favicons?domain=fakebank.example&sz=128',
      'https://www.google.com/s2/favicons?domain=www.fakebank.example&sz=128',
    ])
  })
})

describe('PNG 크기', () => {
  const png = (w: number) => {
    const b = new Uint8Array(24)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    new DataView(b.buffer).setUint32(16, w)
    return b
  }
  it('PNG 머리에서 가로 크기를 읽는다', () => {
    expect(pngWidth(png(16))).toBe(16)
    expect(pngWidth(png(128))).toBe(128)
  })
  it('PNG 가 아니면 null', () => {
    expect(pngWidth(new TextEncoder().encode('<html>not an image at all</html>'))).toBeNull()
    expect(pngWidth(new Uint8Array(4))).toBeNull()
  })
})

describe('ICO 크기와 아이콘 종류', () => {
  // 가짜 ICO: 머리 6바이트 + 그림마다 16바이트 목록 (첫 바이트가 가로, 0 은 256)
  const ico = (...widths: number[]) => {
    const b = new Uint8Array(6 + widths.length * 16)
    b.set([0, 0, 1, 0, widths.length, 0])
    widths.forEach((w, i) => (b[6 + i * 16] = w))
    return b
  }
  it('ICO 에 든 그림 중 가장 큰 가로 크기를 읽는다', () => {
    expect(icoWidth(ico(16, 32))).toBe(32)
    expect(icoWidth(ico(16, 0))).toBe(256)
  })
  it('ICO 가 아니거나 목록이 잘렸으면 null', () => {
    expect(icoWidth(new TextEncoder().encode('<html>not an icon at all</html>'))).toBeNull()
    expect(icoWidth(ico(16).slice(0, 10))).toBeNull()
  })
  // 가짜 JPEG: SOI, APP0(길이 4), SOF2(가로 512) 순서
  const jpeg = (sof = 0xc2) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, sof, 0, 17, 8, 1, 0, 2, 0, 3, 1, 0x22, 0])
  it('JPEG 는 앞 구간을 건너뛰고 SOF 표지에서 가로 크기를 읽는다', () => {
    expect(jpegWidth(jpeg())).toBe(512)
    expect(jpegWidth(jpeg(0xc4))).toBeNull() // 허프만 표(DHT)는 크기 표지가 아니다
    expect(jpegWidth(ico(32))).toBeNull()
  })
  it('PNG·ICO·JPEG 를 구분하고, 셋 다 아니면 null', () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    new DataView(png.buffer).setUint32(16, 180)
    expect(iconInfo(png)).toEqual({ type: 'image/png', width: 180 })
    expect(iconInfo(ico(32))).toEqual({ type: 'image/x-icon', width: 32 })
    expect(iconInfo(jpeg())).toEqual({ type: 'image/jpeg', width: 512 })
    expect(iconInfo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
  })
})

describe('홈페이지의 아이콘 주소', () => {
  const page = 'https://www.fakebank.example/ko/index.html'
  it('rel 에 icon 이 든 링크를 페이지 주소 기준으로 바꾸고, 기본 위치 두 곳을 덧붙인다', () => {
    const html = `<head>
      <link rel="stylesheet" href="/a.css">
      <link rel="shortcut icon" href="/img/fav.ico">
      <LINK REL='apple-touch-icon' sizes='180x180' HREF='touch.png'>
      <link href="https://cdn.fakebank.example/i/192.png" rel="icon" type="image/png">
    </head>`
    expect(iconLinks(html, page)).toEqual([
      'https://www.fakebank.example/img/fav.ico',
      'https://www.fakebank.example/ko/touch.png',
      'https://cdn.fakebank.example/i/192.png',
      'https://www.fakebank.example/apple-touch-icon.png',
      'https://www.fakebank.example/favicon.ico',
    ])
  })
  it('http(s) 가 아닌 주소와 같은 주소 중복은 뺀다', () => {
    const html = `<link rel="icon" href="data:image/png;base64,AAAA"><link rel="icon" href="javascript:alert(1)"><link rel="icon" href="/favicon.ico">`
    expect(iconLinks(html, page)).toEqual(['https://www.fakebank.example/favicon.ico', 'https://www.fakebank.example/apple-touch-icon.png'])
  })
})
