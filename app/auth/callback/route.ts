import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 구글 로그인이 끝나면 Supabase 가 ?code=… 를 붙여 이 주소로 돌려보낸다. 코드를 로그인 세션으로 바꾼다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/login?error=callback`)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/login?error=callback`)
  // 어느 화면으로 갈지는 홈(/)이 가입·승인 상태를 보고 정한다
  return NextResponse.redirect(`${origin}/`)
}
