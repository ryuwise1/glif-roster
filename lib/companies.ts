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

// logo.dev 공개 키(NEXT_PUBLIC_LOGO_DEV_TOKEN)가 있으면 그 로고를, 없으면 키 없이 쓰는 구글 아이콘을 쓴다.
// 구글은 한국 회사 상당수를 www. 를 붙여야 찾으므로 앞 주소가 안 되면 다음 주소를 시도한다
export function logoSrcs(domain: string, token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN): string[] {
  if (token) return [`https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(token)}&size=128&format=png&retina=true`]
  const google = (d: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`
  return [google(domain), google(`www.${domain}`)]
}
