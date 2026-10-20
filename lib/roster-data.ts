import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Career, DirectoryMember } from '@/lib/roster'

const BATCH = 1000 // Supabase 가 한 번에 돌려주는 행 수의 기본 상한

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

// 한 번에 BATCH 개씩 끊어서 전부 읽는다 (상한을 넘으면 조용히 잘리기 때문)
async function fetchAll<T>(build: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await build(from, from + BATCH - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < BATCH) return rows
  }
}

const MEMBER_COLUMNS = 'id, name, cohort, cohort_role, department, student_year, phone, personal_email, work_email'
export const CAREER_COLUMNS =
  'id, member_id, kind, is_current, industry, job_function, company, team, title, region, started_on, ended_on'

export async function loadRoster() {
  const supabase = await createClient()
  const [members, careers, industries, jobFunctions] = await Promise.all([
    fetchAll<DirectoryMember>((from, to) =>
      supabase.from('member_directory').select(MEMBER_COLUMNS).order('id').range(from, to).overrideTypes<DirectoryMember[], { merge: false }>(),
    ),
    fetchAll<Career>((from, to) =>
      supabase.from('careers').select(CAREER_COLUMNS).order('id').range(from, to).overrideTypes<Career[], { merge: false }>(),
    ),
    supabase.from('industries').select('name').order('sort'),
    supabase.from('job_functions').select('name').order('sort'),
  ])
  return {
    members,
    careers,
    industries: (industries.data ?? []).map((r) => r.name as string),
    jobFunctions: (jobFunctions.data ?? []).map((r) => r.name as string),
  }
}
