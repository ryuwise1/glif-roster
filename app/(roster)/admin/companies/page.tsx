import { Suspense } from 'react'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { normCompany, type CompanyDomain } from '@/lib/companies'
import { AppFrame, DoneNote, ErrorNote, PageHeader, buttonClass, inputClass, subtleButtonClass } from '@/components/shell'
import { CompanyLogo } from '@/components/company-logo'
import { clearDomain, saveDomain } from './actions'

const ERRORS: Record<string, string> = {
  domain: '도메인 모양이 아닙니다. 회사 홈페이지 주소를 붙여 넣어 주세요. (예: samsung.com)',
  failed: '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}
const DONE: Record<string, string> = { saved: '로고 도메인을 저장했습니다.', cleared: '로고 도메인을 지웠습니다.' }

type Row = { company: string; careers: number; stored: string | null; domain: string | null }

export default function CompaniesPage({ searchParams }: PageProps<'/admin/companies'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
      <Companies searchParams={searchParams} />
    </Suspense>
  )
}

async function Companies({ searchParams }: { searchParams: PageProps<'/admin/companies'>['searchParams'] }) {
  const { email } = await requireAdmin()
  const params = await searchParams
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined
  const done = typeof params.done === 'string' ? DONE[params.done] : undefined

  const supabase = await createClient()
  const [{ data: careers }, { data: domains }] = await Promise.all([
    supabase.from('careers').select('company').overrideTypes<{ company: string }[], { merge: false }>(),
    supabase.from('company_domains').select('company, domain').overrideTypes<CompanyDomain[], { merge: false }>(),
  ])

  // 이름을 조금 다르게 적은 같은 회사는 한 줄로 모은다. 경력이 많은 회사부터
  const rows = new Map<string, Row>()
  for (const { company } of careers ?? []) {
    const key = normCompany(company)
    const row = rows.get(key)
    if (row) row.careers += 1
    else rows.set(key, { company, careers: 1, stored: null, domain: null })
  }
  for (const d of domains ?? []) {
    const row = rows.get(normCompany(d.company))
    if (row) Object.assign(row, { stored: d.company, domain: d.domain })
  }
  const list = [...rows.values()].sort((a, b) => b.careers - a.careers || a.company.localeCompare(b.company, 'ko'))
  const missing = list.filter((r) => !r.domain).length

  return (
    <AppFrame email={email} isAdmin active="members">
      <PageHeader
        title="회사 로고"
        desc={`회사 ${list.length}곳 · 도메인 없음 ${missing}곳`}
        action={<Link href="/members" className={subtleButtonClass}>연명부</Link>}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {done && <DoneNote>{done}</DoneNote>}
      <p className="mb-4 text-sm leading-6 text-slate">
        회사 홈페이지 주소(도메인)를 넣으면 학회원 상세 화면에 그 회사 로고가 보입니다. 로고를 못 찾거나 너무 작으면 첫 글자가 보입니다.
      </p>

      <ul className="divide-y divide-line border-y border-line">
        {list.map((r) => (
          <li key={r.company} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <CompanyLogo company={r.company} domain={r.domain} size={40} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{r.company}</p>
                <p className="text-xs text-muted">경력 {r.careers}건</p>
              </div>
            </div>
            <form action={saveDomain} className="flex gap-2 sm:w-96">
              {/* 이미 저장한 이름이 있으면 그 이름으로 덮어써서 같은 회사가 두 줄로 남지 않게 한다 */}
              <input type="hidden" name="company" value={r.stored ?? r.company} />
              <label className="sr-only" htmlFor={`d-${r.company}`}>{r.company} 도메인</label>
              <input id={`d-${r.company}`} name="domain" defaultValue={r.domain ?? ''} placeholder="예: samsung.com" maxLength={200} className={inputClass} />
              <button type="submit" className={`${buttonClass} shrink-0`}>저장</button>
            </form>
            {r.stored && (
              <form action={clearDomain}>
                <input type="hidden" name="company" value={r.stored} />
                <button type="submit" className="text-sm text-slate underline underline-offset-2 hover:text-navy">지우기</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </AppFrame>
  )
}
