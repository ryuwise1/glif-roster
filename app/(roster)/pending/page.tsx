import { Suspense } from 'react'
import { requireWaiting } from '@/lib/auth'
import { Shell, subtleButtonClass } from '@/components/shell'
import { signOut } from '../actions'

export default function PendingPage() {
  return (
    <Suspense fallback={<Shell title="가입 신청">{null}</Shell>}>
      <Pending />
    </Suspense>
  )
}

async function Pending() {
  const { account, email } = await requireWaiting()
  const rejected = account.status === '거절'

  return (
    <Shell title={rejected ? '가입 신청이 거절되었습니다' : '승인을 기다리고 있습니다'}>
      {rejected ? (
        <>
          <p className="mb-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            관리자가 이 신청을 받아들이지 않았습니다. 본인이 맞다면 관리자에게 직접 문의해 주세요.
          </p>
          {account.reject_reason && (
            <p className="mb-4 rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">사유: {account.reject_reason}</p>
          )}
        </>
      ) : (
        <p className="mb-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {email ?? '이 계정'}의 가입 신청이 접수되었습니다. 관리자가 확인하면 연명부를 볼 수 있습니다. 승인되면 다시 로그인해 이 화면을 새로고침해 주세요.
        </p>
      )}
      <form action={signOut}>
        <button type="submit" className={subtleButtonClass}>로그아웃</button>
      </form>
    </Shell>
  )
}
