import { Suspense } from 'react'
import Link from 'next/link'
import { requireApproved } from '@/lib/auth'
import { Shell, subtleButtonClass } from '@/components/shell'
import { signOut } from '../actions'

export default function MembersPage() {
  return (
    <Suspense fallback={<Shell title="연명부">{null}</Shell>}>
      <Members />
    </Suspense>
  )
}

// 목록·상세·검색은 4단계에서 만든다. 지금은 승인된 사람이 들어와 있다는 것만 보여 준다.
async function Members() {
  const { account, email } = await requireApproved()
  const isAdmin = account.role !== '학회원'

  return (
    <Shell title="연명부">
      <p className="mb-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {email}님은 승인된 학회원입니다{isAdmin ? ` (${account.role})` : ''}. 연명부 목록은 준비 중입니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <Link href="/admin/approvals" className={subtleButtonClass}>가입 승인 대기</Link>
        )}
        <form action={signOut}>
          <button type="submit" className={subtleButtonClass}>로그아웃</button>
        </form>
      </div>
    </Shell>
  )
}
