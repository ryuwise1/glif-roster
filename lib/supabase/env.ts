// Supabase 대시보드의 URL 과 publishable key. 값은 .env.local (배포는 Vercel 환경변수)에 둔다.
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요합니다 (.env.example 참고)')
  }
  return { url, key }
}
