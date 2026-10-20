import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from './env'

// proxy.ts 에서 부른다. 만료가 가까운 로그인 세션을 갱신해 쿠키에 다시 담고,
// 로그인하지 않은 사람이 공개 경로가 아닌 곳에 오면 /login 으로 보낸다.
// 이것은 빠른 1차 확인일 뿐이고, 진짜 권한 확인은 각 페이지(lib/auth.ts)와 DB 의 RLS 가 한다.
const PUBLIC_PATHS = ['/login', '/auth']

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const { url, key } = supabaseEnv()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) response.cookies.set(name, value, options)
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
  if (!data?.claims && !isPublic) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    // 갱신된 쿠키가 있다면 리다이렉트 응답에도 실어 보낸다
    for (const c of response.cookies.getAll()) redirect.cookies.set(c)
    return redirect
  }
  return response
}
