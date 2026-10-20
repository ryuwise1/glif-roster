// 관리자 회원 편집 폼의 입력 검사. 화면과 분리한 순수 함수라 테스트할 수 있다.
// DB 제약과 같은 규칙을 먼저 검사해, 저장 전에 알아듣기 쉬운 말로 알린다.

import type { Career, CohortRole } from '@/lib/roster'

export type MemberInput = {
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

export type CareerInput = Omit<Career, 'id' | 'member_id'>

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export const HIDDEN_FIELDS = ['phone', 'personal_email', 'work_email'] as const
export type HiddenField = (typeof HIDDEN_FIELDS)[number]

export const CAREER_KINDS = ['정규', '인턴', '학업'] as const
const ROLES: CohortRole[] = ['회장', '부회장']
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

type Form = Pick<FormData, 'get' | 'getAll'>

function text(form: Form, key: string): string | null {
  const v = String(form.get(key) ?? '').trim()
  return v ? v : null
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

export function parseMember(form: Form): Parsed<MemberInput> {
  const name = text(form, 'name')
  if (!name) return fail('이름을 적어 주세요.')

  const cohortText = text(form, 'cohort') ?? ''
  const cohort = Number(cohortText)
  if (!/^\d+$/.test(cohortText) || cohort < 1) return fail('기수는 1 이상의 숫자로 적어 주세요.')

  const role = text(form, 'cohort_role')
  if (role !== null && !ROLES.includes(role as CohortRole)) return fail('역할은 회장·부회장 가운데 고르거나 비워 두세요.')

  const yearText = text(form, 'student_year')
  const studentYear = yearText === null ? null : Number(yearText)
  if (yearText !== null && (!/^\d{1,2}$/.test(yearText) || studentYear! > 99)) return fail('학번은 두 자리 숫자로 적어 주세요. (예: 21)')

  let phone = text(form, 'phone')
  if (phone !== null) {
    const digits = phone.replace(/\D/g, '')
    if (!/^010\d{8}$/.test(digits)) return fail('휴대폰 번호는 010으로 시작하는 11자리로 적어 주세요.')
    phone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  const personalEmail = text(form, 'personal_email')
  const workEmail = text(form, 'work_email')
  if (personalEmail !== null && !EMAIL.test(personalEmail)) return fail('개인 이메일 형식이 맞지 않습니다.')
  if (workEmail !== null && !EMAIL.test(workEmail)) return fail('직장 이메일 형식이 맞지 않습니다.')

  const hidden = form.getAll('hidden_fields').map(String)
  const hiddenFields = HIDDEN_FIELDS.filter((f) => hidden.includes(f))

  return {
    ok: true,
    value: {
      name,
      cohort,
      cohort_role: role as CohortRole | null,
      department: text(form, 'department'),
      student_year: studentYear,
      phone,
      personal_email: personalEmail,
      work_email: workEmail,
      hidden_fields: hiddenFields,
    },
  }
}

// 월 입력(YYYY-MM)을 DB 의 날짜(그달 1일)로 바꾼다. 비어 있으면 null, 형식이 틀리면 undefined.
function monthToDate(v: string | null): string | null | undefined {
  if (v === null) return null
  return MONTH.test(v) ? `${v}-01` : undefined
}

export function parseCareer(form: Form): Parsed<CareerInput> {
  const kind = text(form, 'kind') ?? '정규'
  if (!CAREER_KINDS.includes(kind as CareerInput['kind'])) return fail('구분은 정규·인턴·학업 가운데 골라 주세요.')

  const company = text(form, 'company')
  if (!company) return fail('회사·학교 이름을 적어 주세요.')

  const startedOn = monthToDate(text(form, 'started_on'))
  const endedOn = monthToDate(text(form, 'ended_on'))
  if (startedOn === undefined || endedOn === undefined) return fail('기간은 연도와 달로 적어 주세요. (예: 2024-03)')
  if (startedOn && endedOn && endedOn < startedOn) return fail('끝난 달이 시작한 달보다 앞설 수 없습니다.')

  return {
    ok: true,
    value: {
      kind: kind as CareerInput['kind'],
      is_current: form.get('is_current') === 'on',
      industry: text(form, 'industry'),
      job_function: text(form, 'job_function'),
      company,
      team: text(form, 'team'),
      title: text(form, 'title'),
      region: text(form, 'region'),
      started_on: startedOn,
      ended_on: endedOn,
    },
  }
}

// 저장할 때 DB 가 돌려준 오류를 화면에 보여 줄 말로 바꾼다
export function dbErrorMessage(error: { code?: string; message: string }): string {
  // 트리거가 직접 낸 한국어 안내 (기수 상한, 계정이 연결된 학회원 삭제 등)
  if (error.code === 'P0001') return error.message
  if (error.code === '23514') return '입력 형식이 맞지 않아 저장하지 못했습니다. 값을 다시 확인해 주세요.'
  if (error.code === '23503') return '목록에 없는 업종이나 직무입니다. 목록에서 골라 주세요.'
  return '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
}
