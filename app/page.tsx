import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAccess, homeFor } from '@/lib/auth'

// 상태(미로그인·미신청·대기·승인)에 맞는 첫 화면으로 보낸다
export default function Home() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}>
      <Redirector />
    </Suspense>
  )
}

async function Redirector(): Promise<null> {
  redirect(homeFor(await getAccess()))
}
