// 회사 로고: 관리자가 회사마다 도메인을 정해 두면 그 도메인의 로고를 보여 준다.

export type CompanyDomain = { company: string; domain: string }

// 같은 회사를 조금 다르게 적어도 맞추도록 공백·대소문자·(주)·㈜·주식회사를 지운다
export function normCompany(name: string): string {
  return name.toLowerCase().replace(/\(주\)|㈜|주식회사/g, '').replace(/\s+/g, '')
}

export function domainMap(rows: CompanyDomain[]): Map<string, string> {
  return new Map(rows.map((r) => [normCompany(r.company), r.domain]))
}

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

// 'https://www.Fake.com/ko' → 'fake.com'. 도메인 모양이 아니면 null
export function parseDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '')
  return DOMAIN.test(host) ? host : null
}

// 서버의 로고 찾는 방법을 바꾸면 올린다. 브라우저에 남은 예전 결과(못 찾음 포함)를 버리게 한다
const LOGO_VERSION = 2

// logo.dev 공개 키(NEXT_PUBLIC_LOGO_DEV_TOKEN)가 있으면 그 로고를, 없으면 우리 서버의 /api/logo 를 쓴다.
// logo.dev 는 못 찾으면 404 를 주게 해서(fallback=404) 첫 글자로 넘어가게 한다
export function logoSrc(domain: string, token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN): string {
  const d = encodeURIComponent(domain)
  return token
    ? `https://img.logo.dev/${d}?token=${encodeURIComponent(token)}&size=128&format=png&retina=true&fallback=404`
    : `/api/logo/${d}?v=${LOGO_VERSION}`
}

// 구글 아이콘 서비스 주소. 한국 회사 상당수는 www. 를 붙여야 찾으므로 두 주소를 차례로 본다
export function googleIconUrls(domain: string): string[] {
  const g = (d: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`
  return [g(domain), g(`www.${domain}`)]
}

// PNG 그림의 가로 크기. PNG 가 아니면 null
export function pngWidth(b: Uint8Array): number | null {
  const sig = [0x89, 0x50, 0x4e, 0x47]
  if (b.length < 24 || sig.some((v, i) => b[i] !== v)) return null
  return ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0
}

// ICO 묶음에 든 그림 중 가장 큰 것의 가로 크기(값 0 은 256). ICO 가 아니면 null
export function icoWidth(b: Uint8Array): number | null {
  if (b.length < 22 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1 || b[3] !== 0) return null
  const n = b[4] | (b[5] << 8)
  if (n === 0 || 6 + n * 16 > b.length) return null
  let max = 0
  for (let i = 0; i < n; i++) max = Math.max(max, b[6 + i * 16] || 256)
  return max
}

// JPEG 그림의 가로 크기(SOF 표지에서 읽는다). JPEG 가 아니거나 표지를 못 찾으면 null
export function jpegWidth(b: Uint8Array): number | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length && b[i] === 0xff) {
    const m = b[i + 1]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return (b[i + 7] << 8) | b[i + 8] || null
    i += 2 + ((b[i + 2] << 8) | b[i + 3])
  }
  return null
}

export type IconType = 'image/png' | 'image/x-icon' | 'image/jpeg'

// 아이콘 그림의 종류와 가로 크기. PNG·ICO·JPEG 가 아니면 null (SVG·HTML 오류 화면 등은 쓰지 않는다)
export function iconInfo(b: Uint8Array): { type: IconType; width: number } | null {
  const png = pngWidth(b)
  if (png) return { type: 'image/png', width: png }
  const ico = icoWidth(b)
  if (ico) return { type: 'image/x-icon', width: ico }
  const jpeg = jpegWidth(b)
  return jpeg ? { type: 'image/jpeg', width: jpeg } : null
}

// 홈페이지 HTML 에서 아이콘 주소를 모은다(<link rel="icon">, <link rel="apple-touch-icon"> 등).
// 많은 국내 사이트가 링크 없이 기본 위치에만 두므로 /apple-touch-icon.png 와 /favicon.ico 도 덧붙인다
export function iconLinks(html: string, pageUrl: string): string[] {
  const out = new Set<string>()
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag)) continue
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!href) continue
    try {
      const u = new URL(href.trim(), pageUrl)
      if (u.protocol === 'https:' || u.protocol === 'http:') out.add(u.href)
    } catch {
      // 잘못된 주소는 건너뛴다
    }
  }
  out.add(new URL('/apple-touch-icon.png', pageUrl).href)
  out.add(new URL('/favicon.ico', pageUrl).href)
  return [...out]
}
