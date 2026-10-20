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
    <Shell title={rejected ? '가입 신청이 거절되었습니다' : '승인 대기 중'}>
      {rejected ? (
        <>
          <p className="mb-3 text-sm leading-6 text-slate">본인이 맞다면 회장에게 직접 연락해 주세요.</p>
          {account.reject_reason && (
            <p className="mb-5 rounded border border-line bg-paper px-4 py-3 text-sm text-ink">
              <span className="mr-2 text-xs font-semibold text-slate">사유</span>
              {account.reject_reason}
            </p>
          )}
        </>
      ) : (
        <p className="mb-5 text-sm leading-6 text-slate">
          <span className="font-medium text-ink">{email ?? '이 계정'}</span>로 신청했습니다. 회장이 확인하면 연명부가 열립니다.
        </p>
      )}
      <form action={signOut}>
        <button type="submit" className={subtleButtonClass}>로그아웃</button>
      </form>
    </Shell>
  )
}
