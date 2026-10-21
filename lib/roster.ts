// 연명부 목록의 검색·필터·정렬. 화면과 분리한 순수 함수라 테스트할 수 있다.

export type CohortRole = '회장' | '부회장'

export type DirectoryMember = {
  id: string
  name: string
  cohort: number
  cohort_role: CohortRole | null
  department: string | null
  student_year: number | null
  phone: string | null
  personal_email: string | null
  work_email: string | null
}

export type Career = {
  id: string
  member_id: string
  kind: '정규' | '인턴' | '학업'
  is_current: boolean
  industry: string | null
  job_function: string | null
  company: string
  team: string | null
  title: string | null
  region: string | null
  started_on: string | null
  ended_on: string | null
}

// group: 기수 묶음의 첫 기수(1, 11, 21 …). cohort 를 고르면 group 은 그 기수가 든 묶음이다.
export type Filters = { q: string; group: number | null; cohort: number | null; industry: string; jobFunction: string; page: number }
export type RosterRow = DirectoryMember & { current: Career[]; past: Career[] }

export const PAGE_SIZE = 50

type Params = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

export function parseFilters(params: Params): Filters {
  const cohort = /^\d+$/.test(one(params.cohort)) ? Number(one(params.cohort)) : null
  const group = cohort !== null ? groupOf(cohort) : /^\d+$/.test(one(params.group)) ? groupOf(Number(one(params.group))) : null
  const page = /^\d+$/.test(one(params.page)) ? Math.max(1, Number(one(params.page))) : 1
  return {
    q: one(params.q).trim().slice(0, 50),
    group,
    cohort,
    industry: one(params.industry),
    jobFunction: one(params.jobFunction),
    page,
  }
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, '')

// 오늘 날짜(한국 시간) 'YYYY-MM-DD'
export function todayKST(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 현직: 현직으로 체크했고 끝난 달이 없거나 아직 지나지 않은 경력. 끝난 달이 지나면 저절로 이전 경력이 된다.
// 끝난 달은 달 단위로 본다(관리 화면은 그달 1일, 엑셀 가져오기는 그달 말일로 저장한다).
export function isCurrent(c: Pick<Career, 'is_current' | 'ended_on'>, today: string): boolean {
  return c.is_current && (!c.ended_on || c.ended_on.slice(0, 7) >= today.slice(0, 7))
}

// 최근 경력부터: 끝난 달(없으면 시작한 달)이 늦은 것 → 시작한 달이 늦은 것 → 날짜 없는 것
const recency = (c: Career) => c.ended_on ?? c.started_on ?? ''
const byRecent = (a: Career, b: Career) =>
  recency(b).localeCompare(recency(a)) || (b.started_on ?? '').localeCompare(a.started_on ?? '')

// 검색어는 이름과 모든 경력(현직·전 직장·인턴)의 직장·부서에서 찾는다.
// 업종·직무 필터는 현직 기준이다.
export function filterMembers(members: DirectoryMember[], careers: Career[], f: Filters, today = todayKST()): RosterRow[] {
  const byMember = new Map<string, Career[]>()
  for (const c of careers) {
    const list = byMember.get(c.member_id)
    if (list) list.push(c)
    else byMember.set(c.member_id, [c])
  }
  const q = norm(f.q)

  const rows: RosterRow[] = []
  for (const m of members) {
    const all = byMember.get(m.id) ?? []
    const current = all.filter((c) => isCurrent(c, today))
    if (f.cohort !== null && m.cohort !== f.cohort) continue
    if (f.group !== null && groupOf(m.cohort) !== f.group) continue
    if (f.industry && !current.some((c) => c.industry === f.industry)) continue
    if (f.jobFunction && !current.some((c) => c.job_function === f.jobFunction)) continue
    if (q && !norm(m.name).includes(q) && !all.some((c) => norm(c.company).includes(q) || norm(c.team).includes(q))) continue
    const past = all.filter((c) => !isCurrent(c, today)).sort(byRecent)
    rows.push({ ...m, current, past })
  }

  const roleRank = (r: CohortRole | null) => (r === '회장' ? 0 : r === '부회장' ? 1 : 2)
  return rows.sort(
    (a, b) => a.cohort - b.cohort || roleRank(a.cohort_role) - roleRank(b.cohort_role) || a.name.localeCompare(b.name, 'ko'),
  )
}

export function paginate<T>(rows: T[], page: number): { items: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  return { items: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), pages, page: current }
}

// 홈페이지 Members 화면처럼 기수를 10개씩 묶는다: 1~10, 11~20 …
const GROUP_SIZE = 10
export function groupOf(cohort: number): number {
  return Math.floor((Math.max(cohort, 1) - 1) / GROUP_SIZE) * GROUP_SIZE + 1
}

// 1 → '1st', 2 → '2nd', 11 → '11th', 22 → '22nd'
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export type CohortGroup = { start: number; label: string; cohorts: number[] }

// 있는 기수만 묶음으로 나눈다. 묶음 이름은 '1st–10th' 처럼 묶음의 처음과 끝이다
export function cohortGroups(cohorts: number[]): CohortGroup[] {
  const groups = new Map<number, number[]>()
  for (const c of [...new Set(cohorts)].sort((a, b) => a - b)) {
    const g = groupOf(c)
    groups.set(g, [...(groups.get(g) ?? []), c])
  }
  return [...groups].map(([start, list]) => ({ start, label: `${ordinal(start)}–${ordinal(start + GROUP_SIZE - 1)}`, cohorts: list }))
}

// '2023-03-01' → '2023.03'
export function yearMonth(date: string | null): string | null {
  return date ? date.slice(0, 7).replace('-', '.') : null
}

// 링크드인처럼 시작한 달과 끝난 달을 모두 센다: 2019.05 – 2026.10 → '7년 6개월'. 끝난 달이 없으면 오늘까지 센다.
export function careerSpan(start: string | null, end: string | null, today: string): string | null {
  if (!start) return null
  const to = end ?? today
  const months = (Number(to.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(start.slice(5, 7)) + 1
  if (months < 1) return null
  const years = Math.floor(months / 12)
  return [years ? `${years}년` : '', months % 12 ? `${months % 12}개월` : ''].filter(Boolean).join(' ')
}

// '2019.05 – 현재 · 7년 6개월'. 끝난 달을 모르는 이전 경력은 기간을 세지 않는다.
export function careerPeriod(c: Career, today: string): string | null {
  if (!c.started_on && !c.ended_on) return null
  const current = isCurrent(c, today)
  const end = yearMonth(c.ended_on) ?? (current ? '현재' : '?')
  const span = c.ended_on || current ? careerSpan(c.started_on, c.ended_on, today) : null
  return `${yearMonth(c.started_on) ?? '?'} – ${end}` + (span ? ` · ${span}` : '')
}

export type CareerGroup = { company: string; careers: Career[]; current: boolean; span: string | null }

// 같은 회사 경력을 하나로 묶는다(이름의 공백·대소문자는 무시). 현직 → 최근 경력 순서로, 묶음 안도 같은 순서다.
export function groupByCompany(careers: Career[], today: string): CareerGroup[] {
  const sorted = [...careers].sort((a, b) => Number(isCurrent(b, today)) - Number(isCurrent(a, today)) || byRecent(a, b))
  const groups = new Map<string, Career[]>()
  for (const c of sorted) {
    const key = norm(c.company)
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  return [...groups.values()].map((list) => {
    const current = list.some((c) => isCurrent(c, today))
    const starts = list.map((c) => c.started_on).filter((d): d is string => Boolean(d)).sort()
    const ends = list.map((c) => c.ended_on).filter((d): d is string => Boolean(d)).sort()
    const end = current ? null : (ends.at(-1) ?? null)
    return { company: list[0].company, careers: list, current, span: current || end ? careerSpan(starts[0] ?? null, end, today) : null }
  })
}

export function describeCareer(c: Pick<Career, 'company' | 'team' | 'title' | 'job_function'>): string {
  return [c.company, c.team, c.title].filter(Boolean).join(' · ')
}
