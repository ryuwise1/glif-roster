import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CAREER_COLUMNS } from '@/lib/roster-data'
import type { Career } from '@/lib/roster'
import { AppFrame, DoneNote, ErrorNote, PageHeader, SectionTitle, cardClass, dangerButtonClass, subtleButtonClass } from '@/components/shell'
import { CareerEditor } from '@/components/career-editor'
import { deleteCareer, deleteMember, saveCareer, updateMember } from '../actions'
import { ConfirmButton, MemberForm, type EditableMember } from '../forms'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DONE: Record<string, string> = {
  created: '학회원을 추가했습니다.',
  saved: '기본 정보를 저장했습니다.',
  career: '경력을 저장했습니다.',
  'career-deleted': '경력을 삭제했습니다.',
}
const ERRORS: Record<string, string> = {
  linked: '계정이나 가입 신청이 연결된 학회원은 삭제할 수 없습니다.',
  failed: '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}

export default function EditMemberPage({ params, searchParams }: PageProps<'/admin/members/[id]'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
      <EditMember params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function EditMember({ params, searchParams }: Pick<PageProps<'/admin/members/[id]'>, 'params' | 'searchParams'>) {
  const { email } = await requireAdmin()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const query = await searchParams
  const done = typeof query.done === 'string' ? DONE[query.done] : undefined
  const error = typeof query.error === 'string' ? ERRORS[query.error] : undefined

  const supabase = await createClient()
  const [{ data: member }, { data: careerRows }, { data: settings }, industries, jobFunctions] = await Promise.all([
    supabase
      .from('members')
      .select('id, name, cohort, cohort_role, department, student_year, phone, personal_email, work_email, hidden_fields')
      .eq('id', id)
      .maybeSingle<EditableMember>(),
    supabase
      .from('careers')
      .select(CAREER_COLUMNS)
      .eq('member_id', id)
      .order('is_current', { ascending: false })
      .order('started_on', { ascending: false, nullsFirst: false })
      .overrideTypes<Career[], { merge: false }>(),
    supabase.from('settings').select('current_cohort').maybeSingle(),
    supabase.from('industries').select('name').order('sort'),
    supabase.from('job_functions').select('name').order('sort'),
  ])
  if (!member) notFound()
  const careers = careerRows ?? []
  const industryNames = (industries.data ?? []).map((r) => r.name as string)
  const jobNames = (jobFunctions.data ?? []).map((r) => r.name as string)

  return (
    <AppFrame email={email} isAdmin active="members">
      <PageHeader
        title={`${member.name} 정보 수정`}
        desc={`${member.cohort}기`}
        action={<Link href={`/members/${member.id}`} className={subtleButtonClass}>돌아가기</Link>}
      />
      {done && <DoneNote>{done}</DoneNote>}
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="space-y-6">
        <section className={cardClass}>
          <SectionTitle title="기본 정보" />
          <MemberForm action={updateMember} member={member} maxCohort={settings?.current_cohort ?? 100} submitLabel="기본 정보 저장" />
        </section>

        <CareerEditor
          memberId={member.id}
          careers={careers}
          industries={industryNames}
          jobFunctions={jobNames}
          saveAction={saveCareer}
          deleteAction={deleteCareer}
        />

        <section className="rounded-lg border border-danger/30 bg-white p-5 sm:p-6">
          <SectionTitle title="학회원 삭제" />
          <p className="mb-4 text-sm text-slate">경력도 함께 지워지며 되돌릴 수 없습니다. 계정이 연결된 학회원은 삭제되지 않습니다.</p>
          <form action={deleteMember}>
            <input type="hidden" name="id" value={member.id} />
            <ConfirmButton message={`${member.name} 학회원을 삭제할까요? 되돌릴 수 없습니다.`} className={dangerButtonClass}>학회원 삭제</ConfirmButton>
          </form>
        </section>
      </div>
    </AppFrame>
  )
}
