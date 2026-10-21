'use client'

import { useActionState, type ReactNode } from 'react'
import { ErrorNote, buttonClass, inputClass, labelClass } from '@/components/shell'
import { CAREER_KINDS, HIDDEN_FIELDS, type HiddenField } from '@/lib/member-form'
import type { Career, CohortRole } from '@/lib/roster'
import { saveCareer, type FormState } from './actions'

export type EditableMember = {
  id: string
  name: string
  cohort: number
  cohort_role: CohortRole | null
  department: string | null
  student_year: number | null
  phone: string | null
  personal_email: string | null
  work_email: string | null
  hidden_fields: HiddenField[]
}

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

const HIDDEN_LABEL: Record<HiddenField, string> = { phone: '휴대폰', personal_email: '개인 이메일', work_email: '직장 이메일' }

// 실패해서 돌아온 입력값이 있으면 그것을, 없으면 저장된 값을 보여 준다
function pick(state: FormState, key: string, saved: string | number | null | undefined): string {
  return state.values?.[key]?.[0] ?? (saved == null ? '' : String(saved))
}

function Field({ label, htmlFor, hint, children, className = '' }: { label: string; htmlFor: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClass}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

// locked: 내 정보 수정. 이름·기수·기수 역할은 보여 주기만 하고 보내지 않는다(관리자만 고친다).
export function MemberForm({ action, member, maxCohort, submitLabel, locked = false }: { action: Action; member?: EditableMember; maxCohort: number; submitLabel: string; locked?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {})
  const hidden = (f: HiddenField) => (state.values ? (state.values.hidden_fields ?? []).includes(f) : (member?.hidden_fields ?? []).includes(f))

  return (
    <form action={formAction} className="space-y-5">
      {member && !locked && <input type="hidden" name="id" value={member.id} />}
      {state.error && <ErrorNote>{state.error}</ErrorNote>}

      {locked && member ? (
        <div>
          <dl className="grid gap-4 sm:grid-cols-3">
            {[
              ['이름', member.name],
              ['기수', `${member.cohort}기`],
              ['기수 역할', member.cohort_role ?? '없음'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className={labelClass}>{label}</dt>
                <dd className="flex min-h-11 items-center rounded border border-line bg-paper px-3 text-sm text-slate">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-xs text-muted">이름·기수·기수 역할은 회장에게 말해 주세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="이름 *" htmlFor="name">
            <input id="name" name="name" required maxLength={40} defaultValue={pick(state, 'name', member?.name)} className={inputClass} />
          </Field>
          <Field label="기수 *" htmlFor="cohort">
            <input id="cohort" name="cohort" type="number" required min={1} max={maxCohort} defaultValue={pick(state, 'cohort', member?.cohort)} className={inputClass} />
          </Field>
          <Field label="기수 역할" htmlFor="cohort_role">
            <select id="cohort_role" name="cohort_role" defaultValue={pick(state, 'cohort_role', member?.cohort_role)} className={inputClass}>
              <option value="">없음</option>
              <option value="회장">회장</option>
              <option value="부회장">부회장</option>
            </select>
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="학과" htmlFor="department" className="sm:col-span-2">
          <input id="department" name="department" maxLength={60} defaultValue={pick(state, 'department', member?.department)} className={inputClass} />
        </Field>
        <Field label="학번" htmlFor="student_year" hint="두 자리 (예: 21)">
          <input id="student_year" name="student_year" inputMode="numeric" maxLength={2} defaultValue={pick(state, 'student_year', member?.student_year?.toString().padStart(2, '0'))} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="휴대폰" htmlFor="phone" hint="숫자만 적어도 됩니다">
          <input id="phone" name="phone" type="tel" inputMode="tel" placeholder="010-0000-0000" defaultValue={pick(state, 'phone', member?.phone)} className={inputClass} />
        </Field>
        <Field label="개인 이메일" htmlFor="personal_email">
          <input id="personal_email" name="personal_email" type="email" defaultValue={pick(state, 'personal_email', member?.personal_email)} className={inputClass} />
        </Field>
        <Field label="직장 이메일" htmlFor="work_email">
          <input id="work_email" name="work_email" type="email" defaultValue={pick(state, 'work_email', member?.work_email)} className={inputClass} />
        </Field>
      </div>

      <fieldset>
        <legend className={labelClass}>다른 학회원에게 숨길 항목</legend>
        <div className="flex flex-wrap gap-2">
          {HIDDEN_FIELDS.map((f) => (
            <label key={f} className="inline-flex cursor-pointer items-center gap-2 rounded border border-line bg-white px-3 py-2 text-sm has-[:checked]:border-navy">
              <input type="checkbox" name="hidden_fields" value={f} defaultChecked={hidden(f)} className="size-4 accent-[#172058]" />
              {HIDDEN_LABEL[f]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="border-t border-line pt-5">
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? '저장하는 중…' : submitLabel}</button>
      </div>
    </form>
  )
}

export function CareerForm({ memberId, career, industries, jobFunctions, action = saveCareer }: { memberId: string; career?: Career; industries: string[]; jobFunctions: string[]; action?: Action }) {
  const [state, formAction, pending] = useActionState(action, {})
  const p = career?.id ?? 'new'
  const current = state.values ? state.values.is_current?.[0] === 'on' : (career?.is_current ?? false)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="member_id" value={memberId} />
      {career && <input type="hidden" name="career_id" value={career.id} />}
      {state.error && <ErrorNote>{state.error}</ErrorNote>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="구분" htmlFor={`${p}-kind`}>
          <select id={`${p}-kind`} name="kind" defaultValue={pick(state, 'kind', career?.kind ?? '정규')} className={inputClass}>
            {CAREER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="회사·학교 *" htmlFor={`${p}-company`} className="sm:col-span-2">
          <input id={`${p}-company`} name="company" required maxLength={80} defaultValue={pick(state, 'company', career?.company)} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="부서" htmlFor={`${p}-team`}>
          <input id={`${p}-team`} name="team" maxLength={80} defaultValue={pick(state, 'team', career?.team)} className={inputClass} />
        </Field>
        <Field label="직급·직책" htmlFor={`${p}-title`}>
          <input id={`${p}-title`} name="title" maxLength={40} defaultValue={pick(state, 'title', career?.title)} className={inputClass} />
        </Field>
        <Field label="지역" htmlFor={`${p}-region`}>
          <input id={`${p}-region`} name="region" maxLength={40} defaultValue={pick(state, 'region', career?.region)} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="업종" htmlFor={`${p}-industry`}>
          <select id={`${p}-industry`} name="industry" defaultValue={pick(state, 'industry', career?.industry)} className={inputClass}>
            <option value="">선택 안 함</option>
            {industries.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="직무" htmlFor={`${p}-job_function`}>
          <select id={`${p}-job_function`} name="job_function" defaultValue={pick(state, 'job_function', career?.job_function)} className={inputClass}>
            <option value="">선택 안 함</option>
            {jobFunctions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <Field label="시작한 달" htmlFor={`${p}-started_on`}>
          <input id={`${p}-started_on`} name="started_on" type="month" defaultValue={pick(state, 'started_on', career?.started_on?.slice(0, 7))} className={inputClass} />
        </Field>
        <Field label="끝난 달" htmlFor={`${p}-ended_on`}>
          <input id={`${p}-ended_on`} name="ended_on" type="month" defaultValue={pick(state, 'ended_on', career?.ended_on?.slice(0, 7))} className={inputClass} />
        </Field>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line bg-white px-3 text-sm has-[:checked]:border-navy">
          <input type="checkbox" name="is_current" defaultChecked={current} className="size-4 accent-[#172058]" />
          현재 다니는 곳
        </label>
      </div>

      <button type="submit" disabled={pending} className={buttonClass}>{pending ? '저장하는 중…' : career ? '경력 저장' : '경력 추가'}</button>
    </form>
  )
}

// 되돌릴 수 없는 버튼. 누르면 한 번 더 묻는다.
export function ConfirmButton({ message, className, children }: { message: string; className: string; children: ReactNode }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault() }}>
      {children}
    </button>
  )
}
