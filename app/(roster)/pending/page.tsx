import { Suspense } from 'react'
import { requireWaiting } from '@/lib/auth'
import { Shell, subtleButtonClass } from '@/components/shell'
import { signOut } from '../actions'

export default function PendingPage() {
  return (
    <Suspense fallback={<Shell eyebrow="Application" title="가입 신청">{null}</Shell>}>
      <Pending />
    </Suspense>
  )
}

async function Pending() {
  const { account, email } = await requireWaiting()
  const rejected = account.status === '거절'

  return (
    <Shell eyebrow={rejected ? 'Application Declined' : 'Pending Approval'} title={rejected ? '가입 신청이 거절되었습니다' : '승인을 기다리고 있습니다'}>
      {rejected ? (
        <>
          <p className="mb-3 text-sm leading-6 text-slate">회장이 이 신청을 받아들이지 않았습니다. 본인이 맞다면 회장에게 직접 문의해 주세요.</p>
          {account.reject_reason && (
            <p className="mb-5 rounded border border-line bg-paper px-4 py-3 text-sm text-ink">
              <span className="mr-2 text-xs font-semibold text-slate">사유</span>
              {account.reject_reason}
            </p>
          )}
        </>
      ) : (
        <p className="mb-5 text-sm leading-6 text-slate">
          <span className="font-medium text-ink">{email ?? '이 계정'}</span>의 가입 신청이 접수되었습니다. 회장이 확인하면 연명부를 볼 수 있습니다. 승인 뒤 이 화면을 새로고침해 주세요.
        </p>
      )}
      <form action={signOut}>
        <button type="submit" className={subtleButtonClass}>로그아웃</button>
      </form>
    </Shell>
  )
}
