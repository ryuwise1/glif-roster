import { careerPeriod, describeCareer, isCurrent, todayKST, type Career } from '@/lib/roster'
import { Badge, SectionTitle, cardClass, dangerButtonClass, subtleButtonClass } from '@/components/shell'
import { CareerForm, ConfirmButton } from '@/app/(roster)/admin/members/forms'
import type { FormState } from '@/app/(roster)/admin/members/actions'

// 경력 목록과 추가·수정·삭제 폼. 관리자 수정 화면과 내 정보 화면이 함께 쓴다.
export function CareerEditor({
  memberId,
  careers,
  industries,
  jobFunctions,
  saveAction,
  deleteAction,
}: {
  memberId: string
  careers: Career[]
  industries: string[]
  jobFunctions: string[]
  saveAction: (prev: FormState, formData: FormData) => Promise<FormState>
  deleteAction: (formData: FormData) => Promise<void>
}) {
  const today = todayKST()
  return (
    <section className={cardClass}>
      <SectionTitle title={`경력 ${careers.length}건`} />
      {careers.length === 0 && <p className="mb-4 text-sm text-muted">등록된 경력이 없습니다.</p>}
      <ul className={careers.length ? 'divide-y divide-line border-y border-line' : 'hidden'}>
        {careers.map((c) => (
          <li key={c.id}>
            <details className="group py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                    {describeCareer(c)}
                    {isCurrent(c, today) && <Badge tone="navy">현직</Badge>}
                    {/* 현직으로 체크했지만 끝난 달이 지나 이전 경력으로 보이는 경우 */}
                    {c.is_current && !isCurrent(c, today) && <Badge tone="outline">기간 끝남</Badge>}
                    {c.kind !== '정규' && <Badge>{c.kind}</Badge>}
                  </span>
                  {careerPeriod(c, today) && <span className="font-display text-xs font-medium text-muted">{careerPeriod(c, today)}</span>}
                </span>
                <span className="text-sm font-medium text-navy group-open:hidden">수정</span>
                <span className="hidden text-sm font-medium text-slate group-open:inline">접기</span>
              </summary>
              <div className="mt-4 rounded border border-line bg-paper/60 p-4">
                <CareerForm memberId={memberId} career={c} industries={industries} jobFunctions={jobFunctions} action={saveAction} />
                <form action={deleteAction} className="mt-3 border-t border-line pt-3">
                  <input type="hidden" name="member_id" value={memberId} />
                  <input type="hidden" name="career_id" value={c.id} />
                  <ConfirmButton message={`'${describeCareer(c)}' 경력을 삭제할까요?`} className={dangerButtonClass}>이 경력 삭제</ConfirmButton>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="mt-4" open={careers.length === 0}>
        <summary className={`${subtleButtonClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>+ 경력 추가</summary>
        <div className="mt-4 rounded border border-line bg-paper/60 p-4">
          <CareerForm memberId={memberId} industries={industries} jobFunctions={jobFunctions} action={saveAction} />
        </div>
      </details>
    </section>
  )
}
