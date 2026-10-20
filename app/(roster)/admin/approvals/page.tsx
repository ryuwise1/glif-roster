import { Suspense } from 'react'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ErrorNote, Shell, buttonClass, inputClass, subtleButtonClass } from '@/components/shell'
import { approve, approveAsNew, reject } from './actions'

const ERRORS: Record<string, string> = {
  taken: '이미 다른 계정이 연결된 학회원이라 승인하지 못했습니다.',
  gone: '이미 처리된 신청입니다. 목록을 새로 불러왔습니다.',
  reason: '거절 사유를 적어 주세요.',
  failed: '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}
const DONE: Record<string, string> = { approved: '승인했습니다.', rejected: '거절했습니다.' }

type Pending = {
  user_id: string
  email: string | null
  member_id: string | null
  claimed_name: string | null
  claimed_cohort: number | null
  requested_at: string
  members: { name: string; cohort: number } | null
}

export default function ApprovalsPage({ searchParams }: PageProps<'/admin/approvals'>) {
  return (
    <Suspense fallback={<Shell title="가입 승인 대기" wide>{null}</Shell>}>
      <Approvals searchParams={searchParams} />
    </Suspense>
  )
}

async function Approvals({ searchParams }: { searchParams: PageProps<'/admin/approvals'>['searchParams'] }) {
  await requireAdmin()
  const params = await searchParams
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined
  const done = typeof params.done === 'string' ? DONE[params.done] : undefined

  const supabase = await createClient()
  const { data } = await supabase
    .from('accounts')
    .select('user_id, email, member_id, claimed_name, claimed_cohort, requested_at, members(name, cohort)')
    .eq('status', '대기')
    .order('requested_at')
    .overrideTypes<Pending[], { merge: false }>()
  const list = data ?? []

  return (
    <Shell title="가입 승인 대기" wide>
      {error && <ErrorNote>{error}</ErrorNote>}
      {done && <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{done}</p>}

      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">대기 중인 신청이 없습니다.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((a) => {
            const linked = a.member_id !== null
            const name = a.members?.name ?? a.claimed_name
            const cohort = a.members?.cohort ?? a.claimed_cohort
            return (
              <li key={a.user_id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-base font-medium">{name} <span className="text-sm font-normal text-zinc-500">{cohort}기</span></p>
                <p className="mt-1 break-all text-sm text-zinc-600 dark:text-zinc-400">로그인 계정: {a.email ?? '(이메일 없음)'}</p>
                <p className="mb-3 text-xs text-zinc-500">
                  {linked ? '연명부에 있는 사람을 선택해 신청' : '“목록에 없음”으로 신청 — 승인하면 새 학회원으로 추가됩니다'}
                  {' · '}{new Date(a.requested_at).toLocaleDateString('ko-KR')}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <form action={linked ? approve : approveAsNew}>
                    <input type="hidden" name="user_id" value={a.user_id} />
                    <button type="submit" className={buttonClass}>{linked ? '승인' : '새 학회원으로 추가하고 승인'}</button>
                  </form>
                  <form action={reject} className="flex flex-1 gap-2">
                    <input type="hidden" name="user_id" value={a.user_id} />
                    <label className="sr-only" htmlFor={`reason-${a.user_id}`}>거절 사유</label>
                    <input id={`reason-${a.user_id}`} name="reason" type="text" placeholder="거절 사유" maxLength={200} className={inputClass} />
                    <button type="submit" className={`${subtleButtonClass} shrink-0`}>거절</button>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Link href="/members" className="mt-6 inline-block text-sm text-zinc-500 underline">연명부로 돌아가기</Link>
    </Shell>
  )
}
