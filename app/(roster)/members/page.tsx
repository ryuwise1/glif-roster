import { Suspense } from 'react'
import Link from 'next/link'
import { requireApproved } from '@/lib/auth'
import { loadRoster } from '@/lib/roster-data'
import { filterMembers, paginate, parseFilters, type Career, type Filters, type RosterRow } from '@/lib/roster'
import { AppFrame, CohortLabel, DoneNote, Hero, UnderlineTab, UnderlineTabs, inputClass, buttonClass, subtleButtonClass } from '@/components/shell'

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

  const cohorts = [...new Set(members.map((m) => m.cohort))].sort((a, b) => a - b)
  const filtered = filterMembers(members, careers, filters)
  const { items, pages, page } = paginate(filtered, filters.page)
  const isFiltered = Boolean(filters.q || filters.cohort !== null || filters.industry || filters.jobFunction)

  return (
    <AppFrame
      email={email}
      isAdmin={isAdmin}
      active="members"
      hero={<Hero title="Directory" sub={`성균관대학교 금융투자학회 GLIF 학회원 연명부${cohorts.length ? ` · ${cohorts[0]}기~${cohorts.at(-1)}기 ${members.length}명` : ''}`} />}
    >
      {params.done === 'deleted' && <DoneNote>학회원을 삭제했습니다.</DoneNote>}

      <UnderlineTabs label="기수">
        <UnderlineTab href={pageHref({ ...filters, cohort: null }, 1)} active={filters.cohort === null}>전체</UnderlineTab>
        {cohorts.map((c) => (
          <UnderlineTab key={c} href={pageHref({ ...filters, cohort: c }, 1)} active={filters.cohort === c}>{c}기</UnderlineTab>
        ))}
      </UnderlineTabs>

      <form method="get" className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
        {filters.cohort !== null && <input type="hidden" name="cohort" value={filters.cohort} />}
        <label className="sr-only" htmlFor="q">이름·회사·부서 검색</label>
        <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="이름, 회사, 부서" className={`${inputClass} col-span-2 md:col-span-1`} />
        <label className="sr-only" htmlFor="industry">업종</label>
        <select id="industry" name="industry" defaultValue={filters.industry} className={inputClass}>
          <option value="">업종 전체</option>
          {industries.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="sr-only" htmlFor="jobFunction">직무</label>
        <select id="jobFunction" name="jobFunction" defaultValue={filters.jobFunction} className={inputClass}>
          <option value="">직무 전체</option>
          {jobFunctions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="col-span-2 flex gap-2 md:col-span-1">
          <button type="submit" className={`${buttonClass} flex-1`}>검색</button>
          {isFiltered && <Link href="/members" className={subtleButtonClass}>초기화</Link>}
        </div>
      </form>

      <section>
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className="text-base font-bold text-ink" aria-live="polite">
            {isFiltered ? `검색 결과 ${filtered.length}명` : `${filters.cohort === null ? '전체' : `${filters.cohort}기`} ${filtered.length}명`}
          </h2>
          <div className="flex items-center gap-3">
            {pages > 1 && <span className="text-xs text-muted">{page} / {pages}쪽</span>}
            {isAdmin && <Link href="/admin/members/new" className={subtleButtonClass}>학회원 추가</Link>}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="border-y border-line p-10 text-center text-sm text-muted">
            {members.length === 0 ? '등록된 학회원이 없습니다.' : '조건에 맞는 학회원이 없습니다.'}
          </p>
        ) : (
          <>
            {/* 컴퓨터: 원래 연명부처럼 항목마다 칸을 나눈 표. 이전 직장은 상세 화면에서 본다 */}
            <div className="hidden overflow-x-auto border-t-2 border-navy md:block">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="border-b border-line bg-paper text-xs text-slate">
                  <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-semibold">
                    <th className="!pl-6">기수</th>
                    <th>이름</th>
                    <th>회사</th>
                    <th>부서</th>
                    <th>직급</th>
                    <th>업종</th>
                    <th>직무</th>
                    <th className="!pr-6">연락처</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line border-b border-line">
                  {items.map((r) => (
                    <tr key={r.id} className="align-top transition-colors hover:bg-paper/60 [&>td]:px-3 [&>td]:py-3">
                      <td className="!pl-6 text-slate"><CohortLabel cohort={r.cohort} role={r.cohort_role} /></td>
                      <td className="whitespace-nowrap leading-5">
                        <Link href={`/members/${r.id}`} className="font-semibold text-ink hover:text-navy hover:underline">{r.name}</Link>
                      </td>
                      <JobCell jobs={r.current} pick={(c) => c.company} strong />
                      <JobCell jobs={r.current} pick={(c) => c.team} />
                      <JobCell jobs={r.current} pick={(c) => c.title} />
                      <JobCell jobs={r.current} pick={(c) => c.industry} />
                      <JobCell jobs={r.current} pick={(c) => c.job_function} />
                      <td className="whitespace-nowrap !pr-6 leading-5">
                        {r.phone ? <a href={`tel:${r.phone}`} className="text-ink hover:text-navy">{r.phone}</a> : <Empty />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 휴대폰: 줄 목록 */}
            <ul className="divide-y divide-line border-y border-line md:hidden">
              {items.map((r) => <MemberRow key={r.id} r={r} />)}
            </ul>
          </>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-between py-4 text-sm" aria-label="쪽 이동">
            {page > 1 ? <Link href={pageHref(filters, page - 1)} className={subtleButtonClass}>이전</Link> : <span />}
            <span className="text-xs font-semibold text-slate">{page} / {pages}</span>
            {page < pages ? <Link href={pageHref(filters, page + 1)} className={subtleButtonClass}>다음</Link> : <span />}
          </nav>
        )}
      </section>
    </AppFrame>
  )
}

function Empty() {
  return <span className="text-muted">-</span>
}

// 현직이 둘 이상이면 칸마다 같은 순서로 한 줄씩 쌓아 옆 칸과 줄이 맞게 한다
function JobCell({ jobs, pick, strong }: { jobs: Career[]; pick: (c: Career) => string | null; strong?: boolean }) {
  if (!jobs.length || jobs.every((c) => !pick(c))) return <td className="leading-5"><Empty /></td>
  return (
    <td className={`leading-5 ${strong ? 'font-medium text-ink' : 'text-slate'}`}>
      {jobs.map((c) => <div key={c.id} className="min-h-5">{pick(c) ?? <Empty />}</div>)}
    </td>
  )
}

function MemberRow({ r }: { r: RosterRow }) {
  return (
    <li>
      <Link href={`/members/${r.id}`} className="flex items-center gap-3 px-1 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-ink">
            {r.name}
            <CohortLabel cohort={r.cohort} role={r.cohort_role} className="text-xs font-normal text-slate" />
          </p>
          {r.current.length ? (
            r.current.map((c) => (
              <p key={c.id} className="mt-0.5 truncate text-sm text-slate">{[c.company, c.team, c.title].filter(Boolean).join(' · ')}</p>
            ))
          ) : (
            <p className="mt-0.5 text-sm text-muted">현직 없음</p>
          )}
          {r.phone && <p className="mt-0.5 text-xs text-muted">{r.phone}</p>}
        </div>
        <span aria-hidden className="text-muted">›</span>
      </Link>
    </li>
  )
}
