'use client'

import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { cohortGroups, filterMembers, ordinal, paginate, type Career, type DirectoryMember, type Filters, type RosterRow } from '@/lib/roster'
import { CohortLabel, inputClass, subtleButtonClass, underlineTabClass } from '@/components/shell'

// 연명부 목록. 명단은 처음 한 번만 받아 오고, 기수·검색·쪽 이동은 서버를 다시 부르지 않고 바로 거른다.
// 주소(?cohort= 등)는 그대로 맞춰 두어 새로 고침이나 링크 공유에도 같은 화면이 나온다.

function queryString(f: Filters) {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.cohort !== null) p.set('cohort', String(f.cohort))
  else if (f.group !== null) p.set('group', String(f.group))
  if (f.industry) p.set('industry', f.industry)
  if (f.jobFunction) p.set('jobFunction', f.jobFunction)
  if (f.page > 1) p.set('page', String(f.page))
  const s = p.toString()
  return s ? `/members?${s}` : '/members'
}

export function MemberDirectory({
  members,
  careers,
  industries,
  jobFunctions,
  isAdmin,
  initial,
}: {
  members: DirectoryMember[]
  careers: Career[]
  industries: string[]
  jobFunctions: string[]
  isAdmin: boolean
  initial: Filters
}) {
  const [filters, setFilters] = useState(initial)
  const q = useDeferredValue(filters.q)

  const groups = useMemo(() => cohortGroups(members.map((m) => m.cohort)), [members])
  const filtered = useMemo(() => filterMembers(members, careers, { ...filters, q }), [members, careers, filters, q])
  const { items, pages, page } = paginate(filtered, filters.page)
  const isFiltered = Boolean(filters.q || filters.industry || filters.jobFunction)
  const openGroup = groups.find((g) => g.start === filters.group)

  function update(next: Partial<Filters>) {
    const f = { ...filters, page: 1, ...next }
    setFilters(f)
    window.history.replaceState(null, '', queryString({ ...f, q: f.q.trim() }))
  }

  const title = filters.cohort !== null ? ordinal(filters.cohort) : openGroup ? openGroup.label : 'All'

  return (
    <>
      <nav aria-label="기수" className="mb-6">
        <div className="scrollbar-none -mx-4 flex overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
          <TabButton active={filters.group === null} onClick={() => update({ group: null, cohort: null })}>All</TabButton>
          {groups.map((g) => (
            <TabButton key={g.start} active={filters.group === g.start} onClick={() => update({ group: g.start, cohort: null })}>
              {g.label}
            </TabButton>
          ))}
        </div>
        {openGroup && (
          <div className="scrollbar-none -mx-4 flex overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
            {openGroup.cohorts.map((c) => (
              <TabButton key={c} small active={filters.cohort === c} onClick={() => update({ cohort: filters.cohort === c ? null : c })}>
                {ordinal(c)}
              </TabButton>
            ))}
          </div>
        )}
      </nav>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="sr-only" htmlFor="q">이름·회사·부서 검색</label>
        <input
          id="q"
          type="search"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value.slice(0, 50) })}
          placeholder="이름, 회사, 부서"
          className={`${inputClass} col-span-2 md:col-span-1`}
        />
        <label className="sr-only" htmlFor="industry">업종</label>
        <select id="industry" value={filters.industry} onChange={(e) => update({ industry: e.target.value })} className={inputClass}>
          <option value="">업종 전체</option>
          {industries.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="sr-only" htmlFor="jobFunction">직무</label>
        <select id="jobFunction" value={filters.jobFunction} onChange={(e) => update({ jobFunction: e.target.value })} className={inputClass}>
          <option value="">직무 전체</option>
          {jobFunctions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="col-span-2 flex md:col-span-1">
          <button
            type="button"
            disabled={!isFiltered}
            onClick={() => update({ q: '', industry: '', jobFunction: '' })}
            className={`${subtleButtonClass} flex-1 disabled:opacity-40`}
          >
            초기화
          </button>
        </div>
      </form>

      <section>
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className="text-base font-bold text-ink" aria-live="polite">
            {isFiltered ? `검색 결과 ${filtered.length}명` : `${title} ${filtered.length}명`}
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
                      <JobCell jobs={r.current} pick={(c) => c.title} nowrap />
                      <JobCell jobs={r.current} pick={(c) => c.industry} nowrap />
                      <JobCell jobs={r.current} pick={(c) => c.job_function} nowrap />
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
            {page > 1 ? <button type="button" onClick={() => update({ page: page - 1 })} className={subtleButtonClass}>이전</button> : <span />}
            <span className="text-xs font-semibold text-slate">{page} / {pages}</span>
            {page < pages ? <button type="button" onClick={() => update({ page: page + 1 })} className={subtleButtonClass}>다음</button> : <span />}
          </nav>
        )}
      </section>
    </>
  )
}

function TabButton({ active, small, onClick, children }: { active: boolean; small?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={underlineTabClass(active, small)}>
      {children}
    </button>
  )
}

function Empty() {
  return <span className="text-muted">-</span>
}

// 현직이 둘 이상이면 칸마다 같은 순서로 한 줄씩 쌓아 옆 칸과 줄이 맞게 한다.
// 회사 이름(strong)은 줄바꿈하지 않는다
function JobCell({ jobs, pick, strong, nowrap }: { jobs: Career[]; pick: (c: Career) => string | null; strong?: boolean; nowrap?: boolean }) {
  if (!jobs.length || jobs.every((c) => !pick(c))) return <td className="leading-5"><Empty /></td>
  return (
    <td className={`leading-5 ${strong || nowrap ? 'whitespace-nowrap' : ''} ${strong ? 'font-medium text-ink' : 'text-slate'}`}>
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
              // 회사 이름은 한 줄에 두고, 부서·직급은 그 아래 줄에 둔다
              <div key={c.id} className="mt-0.5 min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.company}</p>
                {(c.team || c.title) && <p className="truncate text-xs text-slate">{[c.team, c.title].filter(Boolean).join(' · ')}</p>}
              </div>
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
