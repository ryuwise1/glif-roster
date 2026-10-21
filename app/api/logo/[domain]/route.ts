import { parseDomain } from '@/lib/companies'
import { googleIcon, larger, siteIcon } from '@/lib/logo-fetch'
import { createClient } from '@/lib/supabase/server'

// 회사 로고 중계. 구글 아이콘 서비스는 못 찾아도 16px 지구본을 주는데, 그때는 응답 코드가 404 라서 서버에서만 가려낼 수 있다.
// 구글이 못 찾거나 작게만 주면 회사 홈페이지의 아이콘(PNG·ICO)도 보고 가장 큰 것을 돌려준다. 하나도 없으면 404 → 화면은 회사 첫 글자.
// 로그인한 사람만 들어온다(proxy). 브라우저가 일주일 저장해 두어 같은 로고를 다시 받지 않는다.
export async function GET(_req: Request, { params }: RouteContext<'/api/logo/[domain]'>) {
  const domain = parseDomain(decodeURIComponent((await params).domain))
  if (!domain || /^[\d.]+$/.test(domain)) return new Response(null, { status: 400 })

  let best = await googleIcon(domain)
  // 홈페이지에 직접 요청하는 것은 관리자가 등록한 도메인일 때만 한다(아무 주소나 대신 요청하지 않도록)
  if ((!best || best.width < 64) && (await isRegistered(domain))) best = larger(best, await siteIcon(domain))

  if (!best) return new Response(null, { status: 404, headers: { 'cache-control': 'private, max-age=3600' } })
  return new Response(best.body, {
    headers: { 'content-type': best.type, 'cache-control': 'private, max-age=604800', 'x-content-type-options': 'nosniff' },
  })
}

async function isRegistered(domain: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.from('company_domains').select('domain').eq('domain', domain).limit(1)
  return Boolean(data?.length)
}
