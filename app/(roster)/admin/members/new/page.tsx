import { Suspense } from 'react'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AppFrame, PageHeader, cardClass, subtleButtonClass } from '@/components/shell'
import { createMember } from '../actions'
import { MemberForm } from '../forms'

export default function NewMemberPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">불러오는 중…</p>}>
      <NewMember />
    </Suspense>
  )
}

async function NewMember() {
  const { email } = await requireAdmin()
  const supabase = await createClient()
  const { data: settings } = await supabase.from('settings').select('current_cohort').maybeSingle()

  return (
    <AppFrame email={email} isAdmin active="members">
      <PageHeader
        eyebrow="Admin"
        title="학회원 추가"
        desc="기본 정보를 저장하면 이어서 경력을 넣을 수 있습니다."
        action={<Link href="/members" className={subtleButtonClass}>취소</Link>}
      />
      <section className={cardClass}>
        <MemberForm action={createMember} maxCohort={settings?.current_cohort ?? 100} submitLabel="학회원 추가" />
      </section>
    </AppFrame>
  )
}
