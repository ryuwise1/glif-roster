import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireApproved } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CAREER_COLUMNS } from '@/lib/roster-data'
import { groupByCompany, isCurrent, todayKST, type Career, type DirectoryMember } from '@/lib/roster'
import { domainMap, type CompanyDomain } from '@/lib/companies'
import { AppFrame, CohortLabel, cardClass, subtleButtonClass } from '@/components/shell'
import { MemberPhoto } from '@/components/member-photo'
import { CareerGroups } from '@/components/career-groups'

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
    .order('started_on', { ascending: false, nullsFirst: false })
    .overrideTypes<Career[], { merge: false }>()
  const careers = data ?? []
  const { data: domains } = await supabase.from('company_domains').select('company, domain').overrideTypes<CompanyDomain[], { merge: false }>()
  const logos = domainMap(domains ?? [])
  const today = todayKST()
  const groups = groupByCompany(careers, today)
  const current = careers.filter((c) => isCurrent(c, today))
  // 현직이 없으면 머리에 가장 최근 경력을 '전'으로 보여 준다
  const headline = current.length ? current : groups[0] ? groups[0].careers.slice(0, 1) : []

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
      <div className="mb-6 flex items-center justify-between gap-2 text-sm">
        <Link href="/members" className="text-slate hover:text-ink">← 연명부</Link>
        {isAdmin ? (
          <Link href={`/admin/members/${member.id}`} className={subtleButtonClass}>정보 수정</Link>
        ) : (
          member.id === account.member_id && <Link href="/me" className={subtleButtonClass}>내 정보 수정</Link>
        )}
      </div>

      {/* 프로필 머리 */}
      <section className="flex flex-col gap-5 border-b border-line pb-8 sm:flex-row sm:items-center">
        <MemberPhoto name={member.name} cohort={member.cohort} />
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{member.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[15px] text-slate">
            <CohortLabel cohort={member.cohort} role={member.cohort_role} />
            {school && <span>· {school}</span>}
          </p>
          {headline.map((c) => (
            <p key={c.id} className={`mt-1 text-[15px] font-medium ${current.length ? 'text-ink' : 'text-muted'}`}>
              {!current.length && '전 '}
              {[c.company, c.team, c.title].filter(Boolean).join(' · ')}
            </p>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-2 text-lg font-bold text-ink">경력</h2>
          {careers.length === 0 ? (
            <p className="border-t border-line py-8 text-sm text-muted">등록된 경력이 없습니다.</p>
          ) : (
            <CareerGroups groups={groups} logos={logos} today={today} />
          )}
        </section>

        <aside className={`${cardClass} self-start`}>
          <h2 className="mb-3 text-base font-bold text-ink">연락처</h2>
          <dl className="space-y-3 text-sm">
            {contacts.map((c) => (
              <div key={c.label}>
                <dt className="text-xs text-slate">{c.label}</dt>
                <dd className="mt-0.5 break-all font-medium">
                  {c.href ? <a href={c.href} className="text-navy hover:underline">{c.value}</a> : <span className="text-muted">-</span>}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </AppFrame>
  )
}
