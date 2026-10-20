import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { requireApproved } from '@/lib/auth'
import { loadRoster } from '@/lib/roster-data'
import { describeCareer, filterMembers, paginate, parseFilters, type Filters, type RosterRow } from '@/lib/roster'
import { AppFrame, Badge, Banner, DoneNote, RoleBadge, Stats, cardClass, inputClass, buttonClass, subtleButtonClass } from '@/components/shell'

export default function MembersPage({ searchParams }: PageProps<'/members'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
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
  const params = await searchParams
  const filters = parseFilters(params)
  const { members, careers, industries, jobFunctions } = await loadRoster()
  const isAdmin = account.role !== '학회원'

  const cohorts = [...new Set(members.map((m) => m.cohort))].sort((a, b) => b - a)
  const filtered = filterMembers(members, careers, filters)
  const { items, pages, page } = paginate(filtered, filters.page)
  const isFiltered = Boolean(filters.q || filters.cohort !== null || filters.industry || filters.jobFunction)
  const withCurrent = new Set(careers.filter((c) => c.is_current).map((c) => c.member_id)).size

  const banner = (
    <Banner
      eyebrow="Member Directory"
      title="GLIF 연명부"
      desc={cohorts.length ? `1기부터 ${cohorts[0]}기까지, 성균관대학교 금융투자학회 GLIF 학회원 명단입니다.` : undefined}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Stats
          items={[
            { label: '학회원', value: members.length, unit: '명' },
            { label: '기수', value: cohorts.length, unit: '개' },
            { label: '현직 등록', value: withCurrent, unit: '명' },
          ]}
        />
        {isAdmin && (
          <Link href="/admin/members/new" className="inline-flex min-h-10 items-center rounded border border-white/40 px-4 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-navy">
            + 학회원 추가
          </Link>
        )}
      </div>
    </Banner>
  )

  return (
    <AppFrame email={email} isAdmin={isAdmin} active="members" banner={banner}>
      {params.done === 'deleted' && <DoneNote>학회원을 삭제했습니다.</DoneNote>}

      {/* 기수 고르기 */}
      <nav aria-label="기수" className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <CohortTab href={pageHref({ ...filters, cohort: null }, 1)} active={filters.cohort === null}>전체</CohortTab>
        {cohorts.map((c) => (
          <CohortTab key={c} href={pageHref({ ...filters, cohort: c }, 1)} active={filters.cohort === c}>{c}기</CohortTab>
        ))}
      </nav>

      <form method="get" className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
        {filters.cohort !== null && <input type="hidden" name="cohort" value={filters.cohort} />}
        <label className="sr-only" htmlFor="q">이름·직장 검색</label>
        <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="이름·직장·부서 검색" className={`${inputClass} col-span-2 md:col-span-1`} />
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

      <section className={`${cardClass} !p-0`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5 sm:px-6">
          <h2 className="text-sm font-bold text-ink" aria-live="polite">
            {isFiltered ? `검색 결과 ${filtered.length}명` : `전체 ${members.length}명`}
          </h2>
          {pages > 1 && <span className="text-xs text-muted">{page} / {pages}쪽</span>}
        </div>

        {items.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">
            {members.length === 0 ? '아직 등록된 학회원이 없습니다.' : '조건에 맞는 학회원이 없습니다.'}
          </p>
        ) : (
          <>
            {/* 컴퓨터: 표 */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-paper text-xs text-slate">
                <tr>
                  <th className="w-[22%] px-6 py-2.5 font-semibold">이름</th>
                  <th className="w-36 py-2.5 font-semibold">기수</th>
                  <th className="py-2.5 font-semibold">현직</th>
                  <th className="w-[24%] px-6 py-2.5 font-semibold">업종 · 직무</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-paper/60">
                    <td className="px-6 py-3">
                      <Link href={`/members/${r.id}`} className="font-semibold text-ink hover:text-navy hover:underline">{r.name}</Link>
                    </td>
                    <td className="whitespace-nowrap py-3">
                      <span className="mr-1.5 text-slate">{r.cohort}기</span>
                      <RoleBadge role={r.cohort_role} />
                    </td>
                    <td className="py-3 text-ink">
                      {r.current.length ? r.current.map((c) => <div key={c.id}>{describeCareer(c)}</div>) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-6 py-3">
                      {r.current.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.current.flatMap((c) => [c.industry, c.job_function]).filter(Boolean).map((t, i) => <Badge key={i}>{t}</Badge>)}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 휴대폰: 줄 목록 */}
            <ul className="divide-y divide-line md:hidden">
              {items.map((r) => <MemberRow key={r.id} r={r} />)}
            </ul>
          </>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-between border-t border-line px-5 py-3 text-sm sm:px-6" aria-label="쪽 이동">
            {page > 1 ? <Link href={pageHref(filters, page - 1)} className={subtleButtonClass}>이전</Link> : <span />}
            <span className="font-display text-xs font-semibold text-slate">{page} / {pages}</span>
            {page < pages ? <Link href={pageHref(filters, page + 1)} className={subtleButtonClass}>다음</Link> : <span />}
          </nav>
        )}
      </section>
    </AppFrame>
  )
}

function CohortTab({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'border-navy bg-navy text-white' : 'border-line bg-white text-slate hover:border-navy hover:text-navy'
      }`}
    >
      {children}
    </Link>
  )
}

function MemberRow({ r }: { r: RosterRow }) {
  return (
    <li>
      <Link href={`/members/${r.id}`} className="flex items-center gap-3 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            {r.name} <span className="text-xs font-normal text-muted">{r.cohort}기</span>
            <RoleBadge role={r.cohort_role} />
          </p>
          {r.current.length ? (
            r.current.map((c) => (
              <p key={c.id} className="mt-0.5 truncate text-sm text-slate">
                {describeCareer(c)}
                {(c.industry || c.job_function) && <span className="text-muted"> · {[c.industry, c.job_function].filter(Boolean).join(' · ')}</span>}
              </p>
            ))
          ) : (
            <p className="mt-0.5 text-sm text-muted">현직 정보 없음</p>
          )}
        </div>
        <span aria-hidden className="text-muted">›</span>
      </Link>
    </li>
  )
}
