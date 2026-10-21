import { type IconType, googleIconUrls, iconInfo, iconLinks } from './companies'

// 회사 로고 그림을 밖에서 받아 오는 부분. /api/logo 가 쓴다.
export type Icon = { body: ArrayBuffer; type: IconType; width: number }

const MAX_BYTES = 512 * 1024 // 아이콘 한 장의 상한. 이보다 큰 응답은 아이콘이 아니라고 본다
const MAX_ICONS = 8 // 홈페이지 하나에서 받아 볼 아이콘 주소 수

async function get(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (GLIF roster logo)' } })
    return r.ok ? r : null
  } catch {
    return null
  }
}

async function icon(url: string): Promise<Icon | null> {
  const r = await get(url)
  if (!r || Number(r.headers.get('content-length') ?? 0) > MAX_BYTES) return null
  const body = await r.arrayBuffer()
  if (body.byteLength > MAX_BYTES) return null
  const info = iconInfo(new Uint8Array(body))
  return info ? { body, ...info } : null
}

export const larger = (a: Icon | null, b: Icon | null): Icon | null => (!a ? b : !b ? a : b.width > a.width ? b : a)

// 구글 아이콘 서비스. 못 찾으면 404 와 16px 지구본을 주므로 성공(200)한 응답만 쓴다
export async function googleIcon(domain: string): Promise<Icon | null> {
  let best: Icon | null = null
  for (const url of googleIconUrls(domain)) {
    best = larger(best, await icon(url))
    if (best && best.width >= 64) break
  }
  return best
}

// 회사 홈페이지에 있는 아이콘 중 가장 큰 것. 구글이 못 찾는 국내 회사가 많아서 둔다.
// 홈페이지가 느리거나(첫 화면으로 넘기는 곳이 많다) 막혀도 되게, 기본 위치의 아이콘은 처음부터 같이 받는다
export async function siteIcon(domain: string): Promise<Icon | null> {
  const fixed = [`https://www.${domain}/favicon.ico`, `https://www.${domain}/apple-touch-icon.png`, `https://${domain}/favicon.ico`]
  const [fromFixed, fromPage] = await Promise.all([Promise.all(fixed.map(icon)), pageIcons(domain, new Set(fixed))])
  return [...fromFixed, ...fromPage].reduce(larger, null)
}

async function pageIcons(domain: string, skip: Set<string>): Promise<(Icon | null)[]> {
  for (const page of [`https://www.${domain}/`, `https://${domain}/`, `http://www.${domain}/`]) {
    const r = await get(page)
    if (!r) continue
    const html = (await r.text()).slice(0, 300_000)
    const urls = iconLinks(html, r.url).filter((u) => !skip.has(u))
    return Promise.all(urls.slice(0, MAX_ICONS).map(icon))
  }
  return []
}
