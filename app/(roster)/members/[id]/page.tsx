import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireApproved } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CAREER_COLUMNS } from '@/lib/roster-data'
import { describeCareer, yearMonth, type Career, type DirectoryMember } from '@/lib/roster'
import { AppFrame, Badge, CohortLabel, PageHeader, SectionTitle, cardClass, subtleButtonClass } from '@/components/shell'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function MemberPage({ params }: PageProps<'/members/[id]'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
      <Member params={params} />
    </Suspense>
  )
}

async function Member({ params }: { params: PageProps<'/members/[id]'>['params'] }) {
  const { account, email } = await requireApproved()
  const isAdmin = account.role !== '학회원'
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

  const contacts = [
    { label: '휴대폰', value: member.phone, href: member.phone ? `tel:${member.phone}` : null },
    { label: '개인 이메일', value: member.personal_email, href: member.personal_email ? `mailto:${member.personal_email}` : null },
    { label: '직장 이메일', value: member.work_email, href: member.work_email ? `mailto:${member.work_email}` : null },
  ]

  return (
    <AppFrame email={email} isAdmin={isAdmin} active="members">
      <PageHeader
        title={member.name}
        desc={<CohortLabel cohort={member.cohort} role={member.cohort_role} />}
        action={
          <div className="flex gap-2">
            <Link href="/members" className={subtleButtonClass}>목록</Link>
            {isAdmin && <Link href={`/admin/members/${member.id}`} className={subtleButtonClass}>수정</Link>}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className={`${cardClass} self-start`}>
          <SectionTitle title="기본 정보" />
          <dl className="grid grid-cols-[5.5rem_1fr] gap-y-3 text-sm">
            <dt className="text-slate">기수</dt>
            <dd className="font-medium"><CohortLabel cohort={member.cohort} role={member.cohort_role} /></dd>
            <dt className="text-slate">학과·학번</dt>
            <dd className="font-medium">{school || <span className="text-muted">-</span>}</dd>
            {contacts.map((c) => (
              <div key={c.label} className="contents">
                <dt className="text-slate">{c.label}</dt>
                <dd className="break-all font-medium">
                  {c.href ? <a href={c.href} className="text-navy underline-offset-2 hover:underline">{c.value}</a> : <span className="text-muted">-</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={cardClass}>
          <SectionTitle title="경력" />
          {careers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">등록된 경력이 없습니다.</p>
          ) : (
            <ol className="relative space-y-5 border-l border-line pl-5">
              {careers.map((c) => (
                <li key={c.id} className="relative">
                  <span aria-hidden className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 ${c.is_current ? 'border-navy bg-navy' : 'border-line bg-white'}`} />
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                    {describeCareer(c)}
                    {c.is_current && <Badge tone="navy">현직</Badge>}
                    {c.kind !== '정규' && <Badge>{c.kind}</Badge>}
                  </p>
                  {(c.industry || c.job_function || c.region) && (
                    <p className="mt-0.5 text-sm text-slate">{[[c.industry, c.job_function].filter(Boolean).join(' · '), c.region].filter(Boolean).join(' / ')}</p>
                  )}
                  {(c.started_on || c.ended_on) && (
                    <p className="mt-0.5 font-display text-xs font-medium text-muted">
                      {yearMonth(c.started_on) ?? '?'} – {c.is_current && !c.ended_on ? '현재' : (yearMonth(c.ended_on) ?? '?')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </AppFrame>
  )
}
