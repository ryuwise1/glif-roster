import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseEnv } from './env'

// 서버 컴포넌트·서버 액션·라우트 핸들러에서 쓰는 Supabase 클라이언트. 로그인 쿠키를 읽고 쓴다.
export async function createClient() {
  const cookieStore = await cookies()
  const { url, key } = supabaseEnv()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options)
        } catch {
          // 서버 컴포넌트 렌더링 중에는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 맡는다.
        }
      },
    },
  })
}
