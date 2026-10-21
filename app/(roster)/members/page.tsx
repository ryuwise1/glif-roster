import { Suspense } from 'react'
import { requireApproved } from '@/lib/auth'
import { loadRoster } from '@/lib/roster-data'
import { ordinal, parseFilters } from '@/lib/roster'
import { AppFrame, DoneNote, Hero } from '@/components/shell'
import { MemberDirectory } from '@/components/member-directory'

export default function MembersPage({ searchParams }: PageProps<'/members'>) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
      <Members searchParams={searchParams} />
    </Suspense>
  )
}

async function Members({ searchParams }: { searchParams: PageProps<'/members'>['searchParams'] }) {
  const { account, email } = await requireApproved()
  const params = await searchParams
  const { members, careers, industries, jobFunctions } = await loadRoster()
  const isAdmin = account.role !== '학회원'

  const cohorts = members.map((m) => m.cohort)
  const range = members.length ? ` · ${ordinal(Math.min(...cohorts))}–${ordinal(Math.max(...cohorts))} ${members.length}명` : ''

  return (
    <AppFrame
      email={email}
      isAdmin={isAdmin}
      active="members"
      hero={<Hero title="Directory" sub={`성균관대학교 금융투자학회 GLIF 학회원 연명부${range}`} />}
    >
      {params.done === 'deleted' && <DoneNote>학회원을 삭제했습니다.</DoneNote>}
      <MemberDirectory
        members={members}
        careers={careers}
        industries={industries}
        jobFunctions={jobFunctions}
        isAdmin={isAdmin}
        initial={parseFilters(params)}
      />
    </AppFrame>
  )
}
