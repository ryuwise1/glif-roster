import { googleIconUrls, parseDomain, pngWidth } from '@/lib/companies'

// 회사 로고 중계. 구글 아이콘 서비스는 못 찾아도 16px 지구본을 주는데, 그때는 응답 코드가 404 라서 서버에서만 가려낼 수 있다.
// 진짜 아이콘(200) 중 가장 큰 것을 돌려주고, 하나도 없으면 404 → 화면은 회사 첫 글자를 보여 준다.
// 로그인한 사람만 들어온다(proxy). 브라우저가 일주일 저장해 두어 같은 로고를 다시 받지 않는다.
export async function GET(_req: Request, { params }: RouteContext<'/api/logo/[domain]'>) {
  const domain = parseDomain(decodeURIComponent((await params).domain))
  if (!domain) return new Response(null, { status: 400 })

  let best: { body: ArrayBuffer; width: number } | null = null
  for (const url of googleIconUrls(domain)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) continue
      const body = await r.arrayBuffer()
      const width = pngWidth(new Uint8Array(body))
      if (width && (!best || width > best.width)) best = { body, width }
      if (best && best.width >= 64) break
    } catch {
      // 다음 주소를 본다
    }
  }

  if (!best) return new Response(null, { status: 404, headers: { 'cache-control': 'private, max-age=86400' } })
  return new Response(best.body, {
    headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=604800', 'x-content-type-options': 'nosniff' },
  })
}
