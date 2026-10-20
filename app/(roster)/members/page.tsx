import { Suspense } from 'react'
import Link from 'next/link'
import { requireApproved } from '@/lib/auth'
import { loadRoster } from '@/lib/roster-data'
import { describeCareer, filterMembers, paginate, parseFilters, type Filters, type RosterRow } from '@/lib/roster'
import { inputClass, buttonClass, subtleButtonClass } from '@/components/shell'
import { signOut } from '../actions'

export default function MembersPage({ searchParams }: PageProps<'/members'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}>
      <Members searchParams={searchParams} />
    </Suspense>
  )
}

function pageHref(f: Filters, page: number) {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.cohort !== null) p.set('cohort', String(f.cohort))
  if (f.industry) p.set('industry', f.industry)
  if (f.jobFunction) p.set('jobFunction', f.jobFunction)
  if (page > 1) p.set('page', String(page))
  const s = p.toString()
  return s ? `/members?${s}` : '/members'
}

async function Members({ searchParams }: { searchParams: PageProps<'/members'>['searchParams'] }) {
  const { account, email } = await requireApproved()
  const filters = parseFilters(await searchParams)
  const { members, careers, industries, jobFunctions } = await loadRoster()

  const cohorts = [...new Set(members.map((m) => m.cohort))].sort((a, b) => b - a)
  const filtered = filterMembers(members, careers, filters)
  const { items, pages, page } = paginate(filtered, filters.page)
  const isFiltered = Boolean(filters.q || filters.cohort !== null || filters.industry || filters.jobFunction)

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">GLIF 연명부</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-zinc-500 sm:inline">{email}</span>
          {account.role !== '학회원' && (
            <Link href="/admin/approvals" className={subtleButtonClass}>가입 승인</Link>
          )}
          <form action={signOut}>
            <button type="submit" className={subtleButtonClass}>로그아웃</button>
          </form>
        </div>
      </header>

      <form method="get" className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="sr-only" htmlFor="q">이름·직장 검색</label>
        <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="이름·직장 검색" className={`${inputClass} col-span-2 md:col-span-1`} />
        <label className="sr-only" htmlFor="cohort">기수</label>
        <select id="cohort" name="cohort" defaultValue={filters.cohort ?? ''} className={inputClass}>
          <option value="">전체 기수</option>
          {cohorts.map((c) => <option key={c} value={c}>{c}기</option>)}
        </select>
        <label className="sr-only" htmlFor="industry">업종</label>
        <select id="industry" name="industry" defaultValue={filters.industry} className={inputClass}>
          <option value="">전체 업종</option>
          {industries.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="sr-only" htmlFor="jobFunction">직무</label>
        <select id="jobFunction" name="jobFunction" defaultValue={filters.jobFunction} className={inputClass}>
          <option value="">전체 직무</option>
          {jobFunctions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="col-span-2 flex gap-2 md:col-span-1">
          <button type="submit" className={`${buttonClass} flex-1`}>검색</button>
          {isFiltered && <Link href="/members" className={subtleButtonClass}>초기화</Link>}
        </div>
      </form>

      <p className="mb-2 text-sm text-zinc-500" aria-live="polite">
        {isFiltered ? `검색 결과 ${filtered.length}명` : `전체 ${members.length}명`}
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          {members.length === 0 ? '아직 등록된 학회원이 없습니다.' : '조건에 맞는 학회원이 없습니다.'}
        </p>
      ) : (
        <>
          {/* 컴퓨터: 표 */}
          <div className="hidden overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 md:block dark:bg-zinc-900 dark:ring-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">기수</th>
                  <th className="px-4 py-2 font-medium">현직</th>
                  <th className="px-4 py-2 font-medium">업종 · 직무</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/members/${r.id}`} className="underline-offset-2 hover:underline">{r.name}</Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.cohort}기 <RoleBadge role={r.cohort_role} /></td>
                    <td className="px-4 py-3">{r.current.length ? r.current.map((c) => <div key={c.id}>{describeCareer(c)}</div>) : <span className="text-zinc-400">—</span>}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {r.current.length ? r.current.map((c) => <div key={c.id}>{[c.industry, c.job_function].filter(Boolean).join(' · ') || '—'}</div>) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 휴대폰: 카드 */}
          <ul className="space-y-2 md:hidden">
            {items.map((r) => <MemberCard key={r.id} r={r} />)}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="쪽 이동">
          {page > 1 ? <Link href={pageHref(filters, page - 1)} className={subtleButtonClass}>이전</Link> : <span />}
          <span className="text-zinc-500">{page} / {pages}</span>
          {page < pages ? <Link href={pageHref(filters, page + 1)} className={subtleButtonClass}>다음</Link> : <span />}
        </nav>
      )}
    </main>
  )
}

function RoleBadge({ role }: { role: RosterRow['cohort_role'] }) {
  if (!role) return null
  return <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{role}</span>
}

function MemberCard({ r }: { r: RosterRow }) {
  return (
    <li>
      <Link href={`/members/${r.id}`} className="block rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <p className="font-medium">{r.name} <span className="text-sm font-normal text-zinc-500">{r.cohort}기</span><RoleBadge role={r.cohort_role} /></p>
        {r.current.length ? (
          r.current.map((c) => (
            <p key={c.id} className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {describeCareer(c)}
              {(c.industry || c.job_function) && <span className="text-zinc-400"> ({[c.industry, c.job_function].filter(Boolean).join(' · ')})</span>}
            </p>
          ))
        ) : (
          <p className="mt-1 text-sm text-zinc-400">현직 정보 없음</p>
        )}
      </Link>
    </li>
  )
}
