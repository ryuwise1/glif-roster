import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireApproved } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CAREER_COLUMNS } from '@/lib/roster-data'
import { describeCareer, yearMonth, type Career, type DirectoryMember } from '@/lib/roster'
import { subtleButtonClass } from '@/components/shell'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function MemberPage({ params }: PageProps<'/members/[id]'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">불러오는 중…</p>}>
      <Member params={params} />
    </Suspense>
  )
}

async function Member({ params }: { params: PageProps<'/members/[id]'>['params'] }) {
  await requireApproved()
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const supabase = await createClient()
  const { data: member } = await supabase
    .from('member_directory')
    .select('id, name, cohort, cohort_role, department, student_year, phone, personal_email, work_email')
    .eq('id', id)
    .maybeSingle<DirectoryMember>()
  if (!member) notFound()

  const { data } = await supabase
    .from('careers')
    .select(CAREER_COLUMNS)
    .eq('member_id', id)
    .order('is_current', { ascending: false })
    .order('started_on', { ascending: false, nullsFirst: false })
    .overrideTypes<Career[], { merge: false }>()
  const careers = data ?? []

  const school = [member.department, member.student_year !== null ? `${String(member.student_year).padStart(2, '0')}학번` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <Link href="/members" className={`${subtleButtonClass} mb-4`}>← 목록</Link>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <h1 className="text-xl font-semibold tracking-tight">
          {member.name}
          {member.cohort_role && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-normal text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              {member.cohort}기 {member.cohort_role}
            </span>
          )}
        </h1>
        <dl className="mt-4 grid grid-cols-[5.5rem_1fr] gap-y-2 text-sm">
          <dt className="text-zinc-500">기수</dt><dd>{member.cohort}기</dd>
          <dt className="text-zinc-500">학과·학번</dt><dd>{school || '—'}</dd>
          <dt className="text-zinc-500">휴대폰</dt>
          <dd>{member.phone ? <a href={`tel:${member.phone}`} className="underline">{member.phone}</a> : '—'}</dd>
          <dt className="text-zinc-500">개인 이메일</dt>
          <dd className="break-all">{member.personal_email ? <a href={`mailto:${member.personal_email}`} className="underline">{member.personal_email}</a> : '—'}</dd>
          <dt className="text-zinc-500">직장 이메일</dt>
          <dd className="break-all">{member.work_email ? <a href={`mailto:${member.work_email}`} className="underline">{member.work_email}</a> : '—'}</dd>
        </dl>
        <p className="mt-3 text-xs text-zinc-400">“—”는 등록되지 않았거나 본인이 숨긴 항목입니다.</p>
      </section>

      <section className="mt-4">
        <h2 className="mb-2 text-base font-semibold">경력</h2>
        {careers.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-sm text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">등록된 경력이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {careers.map((c) => (
              <li key={c.id} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <p className="font-medium">
                  {describeCareer(c)}
                  {c.is_current && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 align-middle text-xs font-normal text-green-900 dark:bg-green-900/40 dark:text-green-200">현직</span>}
                  {c.kind !== '정규' && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 align-middle text-xs font-normal text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{c.kind}</span>}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {[[c.industry, c.job_function].filter(Boolean).join(' · '), c.region].filter(Boolean).join(' / ') || null}
                </p>
                {(c.started_on || c.ended_on) && (
                  <p className="mt-1 text-xs text-zinc-400">
                    {yearMonth(c.started_on) ?? '?'} ~ {c.is_current && !c.ended_on ? '현재' : (yearMonth(c.ended_on) ?? '?')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
