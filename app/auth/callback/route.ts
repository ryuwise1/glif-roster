import { NextResponse, type NextRequest } from 'next/server'
import { getAccess, homeFor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// 구글 로그인이 끝나면 Supabase 가 ?code=… 를 붙여 이 주소로 돌려보낸다. 코드를 로그인 세션으로 바꾼다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/login?error=callback`)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/login?error=callback`)
  // 홈(/)을 거치지 않고 가입·승인 상태에 맞는 화면으로 바로 보낸다
  return NextResponse.redirect(`${origin}${homeFor(await getAccess(supabase))}`)
}
