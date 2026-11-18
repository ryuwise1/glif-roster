import { Suspense } from 'react'
import { Loading } from '@/components/shell'
import { redirect } from 'next/navigation'
import { getAccess, homeFor } from '@/lib/auth'

// 상태(미로그인·미신청·대기·승인)에 맞는 첫 화면으로 보낸다
export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Redirector />
    </Suspense>
  )
}

async function Redirector(): Promise<null> {
  redirect(homeFor(await getAccess()))
}
