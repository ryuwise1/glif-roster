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

// logo.dev 공개 키(NEXT_PUBLIC_LOGO_DEV_TOKEN)가 있으면 그 로고를, 없으면 우리 서버의 /api/logo 를 쓴다.
// logo.dev 는 못 찾으면 404 를 주게 해서(fallback=404) 첫 글자로 넘어가게 한다
export function logoSrc(domain: string, token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN): string {
  const d = encodeURIComponent(domain)
  return token
    ? `https://img.logo.dev/${d}?token=${encodeURIComponent(token)}&size=128&format=png&retina=true&fallback=404`
    : `/api/logo/${d}`
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
