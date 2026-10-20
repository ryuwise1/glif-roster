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

export type Filters = { q: string; cohort: number | null; industry: string; jobFunction: string; page: number }
export type RosterRow = DirectoryMember & { current: Career[] }

export const PAGE_SIZE = 50

type Params = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

export function parseFilters(params: Params): Filters {
  const cohort = /^\d+$/.test(one(params.cohort)) ? Number(one(params.cohort)) : null
  const page = /^\d+$/.test(one(params.page)) ? Math.max(1, Number(one(params.page))) : 1
  return {
    q: one(params.q).trim().slice(0, 50),
    cohort,
    industry: one(params.industry),
    jobFunction: one(params.jobFunction),
    page,
  }
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, '')

// 검색어는 이름과 모든 경력(현직·전 직장·인턴)의 직장·부서에서 찾는다.
// 업종·직무 필터는 현직 기준이다.
export function filterMembers(members: DirectoryMember[], careers: Career[], f: Filters): RosterRow[] {
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
    const current = all.filter((c) => c.is_current)
    if (f.cohort !== null && m.cohort !== f.cohort) continue
    if (f.industry && !current.some((c) => c.industry === f.industry)) continue
    if (f.jobFunction && !current.some((c) => c.job_function === f.jobFunction)) continue
    if (q && !norm(m.name).includes(q) && !all.some((c) => norm(c.company).includes(q) || norm(c.team).includes(q))) continue
    rows.push({ ...m, current })
  }

  const roleRank = (r: CohortRole | null) => (r === '회장' ? 0 : r === '부회장' ? 1 : 2)
  return rows.sort(
    (a, b) => b.cohort - a.cohort || roleRank(a.cohort_role) - roleRank(b.cohort_role) || a.name.localeCompare(b.name, 'ko'),
  )
}

export function paginate<T>(rows: T[], page: number): { items: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  return { items: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), pages, page: current }
}

// '2023-03-01' → '2023.03'
export function yearMonth(date: string | null): string | null {
  return date ? date.slice(0, 7).replace('-', '.') : null
}

export function describeCareer(c: Pick<Career, 'company' | 'team' | 'title' | 'job_function'>): string {
  return [c.company, c.team, c.title].filter(Boolean).join(' · ')
}
