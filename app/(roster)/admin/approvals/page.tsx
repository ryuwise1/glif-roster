import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AppFrame, Badge, DoneNote, ErrorNote, PageHeader, buttonClass, cardClass, inputClass, subtleButtonClass } from '@/components/shell'
import { nameMatches } from '@/lib/approvals'
import { approve, approveAsNew, approveMany, reject } from './actions'

const ERRORS: Record<string, string> = {
  taken: '이미 다른 계정이 연결된 학회원이라 승인하지 못했습니다.',
  gone: '이미 처리된 신청입니다. 목록을 새로 불러왔습니다.',
  reason: '거절 사유를 적어 주세요.',
  none: '승인할 신청을 하나 이상 체크해 주세요.',
  failed: '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}
const DONE: Record<string, string> = { approved: '승인했습니다.', rejected: '거절했습니다.' }

type Pending = {
  user_id: string
  email: string | null
  login_name: string | null
  member_id: string | null
  claimed_name: string | null
  claimed_cohort: number | null
  requested_at: string
  members: { name: string; cohort: number } | null
}

export default function ApprovalsPage({ searchParams }: PageProps<'/admin/approvals'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
      <Approvals searchParams={searchParams} />
    </Suspense>
  )
}

async function Approvals({ searchParams }: { searchParams: PageProps<'/admin/approvals'>['searchParams'] }) {
  const { email } = await requireAdmin()
  const params = await searchParams
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined
  const done = params.done === 'bulk' ? bulkDone(params.n, params.skipped) : typeof params.done === 'string' ? DONE[params.done] : undefined

  const supabase = await createClient()
  const { data, error: loadError } = await supabase
    .from('accounts')
    .select('user_id, email, login_name, member_id, claimed_name, claimed_cohort, requested_at, members(name, cohort)')
    .eq('status', '대기')
    .order('requested_at')
    .overrideTypes<Pending[], { merge: false }>()
  const list = data ?? []
  const linkedCount = list.filter((a) => a.member_id !== null).length

  return (
    <AppFrame email={email} isAdmin active="approvals">
      <PageHeader title="가입 승인" desc={loadError ? undefined : `대기 ${list.length}건`} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {done && <DoneNote>{done}</DoneNote>}

      {loadError ? (
        // 조회가 실패했을 때 "대기 없음"으로 보이면 신청을 놓치므로 따로 알린다
        <ErrorNote>신청 목록을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</ErrorNote>
      ) : list.length === 0 ? (
        <p className={`${cardClass} text-center text-sm text-muted`}>대기 중인 신청이 없습니다.</p>
      ) : (
        <>
          {linkedCount > 0 && (
            <form id="bulk" action={approveMany} className="mb-4 flex flex-col gap-3 rounded-lg border border-navy/20 bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate">로그인 이름이 연명부 이름과 같은 신청은 미리 체크했습니다. 구글 이름은 본인이 바꿀 수 있으니 한 번 더 보고 승인하세요.</p>
              <button type="submit" className={`${buttonClass} shrink-0`}>체크한 신청 승인</button>
            </form>
          )}
          <ul className="space-y-3">
            {list.map((a) => {
              const linked = a.member_id !== null
              const name = a.members?.name ?? a.claimed_name
              const cohort = a.members?.cohort ?? a.claimed_cohort
              const matched = linked && nameMatches(a.login_name, a.members?.name ?? null)
              return (
                <li key={a.user_id} className={cardClass}>
                  <div className="flex items-start gap-3">
                    {linked && (
                      <input
                        type="checkbox"
                        form="bulk"
                        name="user_id"
                        value={a.user_id}
                        defaultChecked={matched}
                        aria-label={`${name} 신청 체크`}
                        className="mt-1 size-4 shrink-0 accent-[#172058]"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-base font-bold text-ink">
                        {name} <span className="text-sm font-normal text-slate">{cohort}기</span>
                        {matched && <Badge tone="ok">이름 일치</Badge>}
                        {!linked && <Badge tone="outline">목록에 없음</Badge>}
                      </p>
                      <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
                        <dt className="text-slate">로그인 이름</dt>
                        <dd className="text-ink">{a.login_name ?? <span className="text-muted">(없음)</span>}</dd>
                        <dt className="text-slate">계정</dt>
                        <dd className="break-all text-ink">{a.email ?? <span className="text-muted">(이메일 없음)</span>}</dd>
                        <dt className="text-slate">신청일</dt>
                        <dd className="text-ink">{new Date(a.requested_at).toLocaleDateString('ko-KR')}</dd>
                      </dl>
                      {!linked && <p className="mt-2 text-xs text-muted">승인하면 이 이름과 기수로 새 학회원이 추가됩니다.</p>}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-start">
                    <form action={linked ? approve : approveAsNew}>
                      <input type="hidden" name="user_id" value={a.user_id} />
                      <button type="submit" className={`${buttonClass} w-full sm:w-auto`}>{linked ? '승인' : '새 학회원으로 추가하고 승인'}</button>
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
        </>
      )}
    </AppFrame>
  )
}

function bulkDone(n: string | string[] | undefined, skipped: string | string[] | undefined): string {
  const count = (v: typeof n) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : 0)
  const skip = count(skipped)
  return `${count(n)}명을 승인했습니다.` + (skip ? ` ${skip}명은 이미 처리됐거나 다른 계정이 연결돼 건너뛰었습니다.` : '')
}
