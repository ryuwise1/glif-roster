import { Suspense } from 'react'
import Link from 'next/link'
import { requireApproved } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CAREER_COLUMNS } from '@/lib/roster-data'
import type { Career } from '@/lib/roster'
import { AppFrame, DoneNote, ErrorNote, PageHeader, SectionTitle, cardClass, subtleButtonClass } from '@/components/shell'
import { CareerEditor } from '@/components/career-editor'
import { MemberForm, type EditableMember } from '../admin/members/forms'
import { deleteMyCareer, saveMyCareer, updateMyInfo } from './actions'

const DONE: Record<string, string> = {
  saved: '내 정보를 저장했습니다.',
  career: '경력을 저장했습니다.',
  'career-deleted': '경력을 삭제했습니다.',
}
const ERRORS: Record<string, string> = {
  failed: '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}

export default function MyPage({ searchParams }: PageProps<'/me'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
      <My searchParams={searchParams} />
    </Suspense>
  )
}

async function My({ searchParams }: { searchParams: PageProps<'/me'>['searchParams'] }) {
  const { account, email } = await requireApproved()
  const isAdmin = account.role !== '학회원'
  const query = await searchParams
  const done = typeof query.done === 'string' ? DONE[query.done] : undefined
  const error = typeof query.error === 'string' ? ERRORS[query.error] : undefined

  if (!account.member_id) {
    return (
      <AppFrame email={email} isAdmin={isAdmin} active="me">
        <PageHeader title="내 정보" />
        <p className={`${cardClass} text-sm text-slate`}>이 계정은 아직 연명부의 학회원과 연결되지 않았습니다. 회장에게 연결을 요청해 주세요.</p>
      </AppFrame>
    )
  }

  const id = account.member_id
  const supabase = await createClient()
  const [{ data: member }, { data: careerRows }, industries, jobFunctions] = await Promise.all([
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
    supabase.from('industries').select('name').order('sort'),
    supabase.from('job_functions').select('name').order('sort'),
  ])

  return (
    <AppFrame email={email} isAdmin={isAdmin} active="me">
      <PageHeader
        title="내 정보"
        desc="고치면 바로 연명부에 반영됩니다."
        action={<Link href={`/members/${id}`} className={subtleButtonClass}>내 연명부 보기</Link>}
      />
      {done && <DoneNote>{done}</DoneNote>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {member ? (
        <div className="space-y-6">
          <section className={cardClass}>
            <SectionTitle title="기본 정보" />
            <MemberForm action={updateMyInfo} member={member} maxCohort={member.cohort} submitLabel="내 정보 저장" locked />
          </section>
          <CareerEditor
            memberId={id}
            careers={careerRows ?? []}
            industries={(industries.data ?? []).map((r) => r.name as string)}
            jobFunctions={(jobFunctions.data ?? []).map((r) => r.name as string)}
            saveAction={saveMyCareer}
            deleteAction={deleteMyCareer}
          />
        </div>
      ) : (
        <ErrorNote>내 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</ErrorNote>
      )}
    </AppFrame>
  )
}
