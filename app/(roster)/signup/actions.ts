'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUnregistered } from '@/lib/auth'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 가입 신청: 기수에서 본인을 골랐으면 그 사람과, "목록에 없음"이면 적은 이름·기수로 신청한다.
// 승인된 신청이나 관리자 역할을 스스로 넣는 것은 DB(RLS)가 막으므로 여기서는 입력 모양만 확인한다.
export async function submitSignup(formData: FormData) {
  const access = await requireUnregistered()
  const cohort = Number(formData.get('cohort'))
  const back = (error: string) => redirect(`/signup?cohort=${Number.isInteger(cohort) ? cohort : ''}&error=${error}`)
  if (!Number.isInteger(cohort) || cohort < 1) redirect('/signup')

  const choice = String(formData.get('member') ?? '')
  const row: { user_id: string; member_id?: string; claimed_name?: string; claimed_cohort?: number } = {
    user_id: access.userId,
  }
  if (choice === 'none') {
    const name = String(formData.get('name') ?? '').trim()
    if (!name) back('name')
    row.claimed_name = name
    row.claimed_cohort = cohort
  } else if (UUID.test(choice)) {
    row.member_id = choice
  } else {
    back('choice')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('accounts').insert(row)
  if (error) back(error.message.includes('이미 다른 계정과 연결된') ? 'taken' : 'failed')
  // 학회 드라이브를 공유받은 계정은 DB 가 신청과 함께 바로 승인하므로, 갈 곳은 홈(/)이 상태를 보고 정한다
  redirect('/')
}
