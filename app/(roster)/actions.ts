'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// 지금 요청이 들어온 주소 (로컬, 배포, PR 미리보기 어디서든 같은 곳으로 돌아오게 한다)
async function siteOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

async function signInWith(provider: 'google' | 'kakao') {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${await siteOrigin()}/auth/callback` },
  })
  if (error || !data.url) redirect('/login?error=start')
  redirect(data.url)
}

export async function signInWithGoogle() {
  await signInWith('google')
}

// 카카오는 Supabase 에서 카카오 로그인을 켠 뒤 환경변수 KAKAO_LOGIN=on 으로 버튼을 보인다
export async function signInWithKakao() {
  if (process.env.KAKAO_LOGIN !== 'on') redirect('/login?error=start')
  await signInWith('kakao')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
