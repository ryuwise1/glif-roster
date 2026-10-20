'use server'

import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIST = '/admin/approvals'

function targetId(formData: FormData): string {
  const id = String(formData.get('user_id') ?? '')
  if (!UUID.test(id)) redirect(`${LIST}?error=failed`)
  return id
}

// 연명부의 사람과 이미 연결된 신청을 승인한다
export async function approve(formData: FormData) {
  await requireAdmin()
  const userId = targetId(formData)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounts')
    .update({ status: '승인' })
    .eq('user_id', userId)
    .eq('status', '대기')
    .select('user_id')
  // 같은 사람에 이미 승인된 계정이 있으면 DB 의 유일 제약이 막는다
  if (error) redirect(`${LIST}?error=${error.code === '23505' ? 'taken' : 'failed'}`)
  if (!data?.length) redirect(`${LIST}?error=gone`)
  redirect(`${LIST}?done=approved`)
}

// 체크한 신청을 한 번에 승인한다. 연명부의 사람과 연결된 신청만 대상이고,
// 이미 처리됐거나 다른 계정이 연결된 사람은 건너뛰고 몇 명을 건너뛰었는지 알린다.
const BULK_LIMIT = 200

export async function approveMany(formData: FormData) {
  await requireAdmin()
  const ids = [...new Set(formData.getAll('user_id').map(String))]
  if (!ids.length) redirect(`${LIST}?error=none`)
  if (ids.length > BULK_LIMIT || !ids.every((id) => UUID.test(id))) redirect(`${LIST}?error=failed`)

  const supabase = await createClient()
  let approved = 0
  for (const userId of ids) {
    const { data } = await supabase
      .from('accounts')
      .update({ status: '승인' })
      .eq('user_id', userId)
      .eq('status', '대기')
      .not('member_id', 'is', null)
      .select('user_id')
    if (data?.length) approved++
  }
  redirect(`${LIST}?done=bulk&n=${approved}&skipped=${ids.length - approved}`)
}

// "목록에 없음"으로 신청한 사람을 새 학회원으로 추가하고 그 사람에 연결해 승인한다
export async function approveAsNew(formData: FormData) {
  await requireAdmin()
  const userId = targetId(formData)
  const supabase = await createClient()

  const { data: account } = await supabase
    .from('accounts')
    .select('claimed_name, claimed_cohort, member_id, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!account || account.status !== '대기') redirect(`${LIST}?error=gone`)
  if (account.member_id || !account.claimed_name || !account.claimed_cohort) redirect(`${LIST}?error=failed`)

  const { data: member, error: memberError } = await supabase
    .from('members')
    .insert({ name: account.claimed_name, cohort: account.claimed_cohort })
    .select('id')
    .single()
  if (memberError || !member) redirect(`${LIST}?error=failed`)

  const { data, error } = await supabase
    .from('accounts')
    .update({ member_id: member.id, status: '승인' })
    .eq('user_id', userId)
    .eq('status', '대기')
    .select('user_id')
  if (error || !data?.length) {
    // 연결에 실패하면 방금 만든 학회원을 되돌린다 (아직 연결된 계정이 없어 지울 수 있다)
    await supabase.from('members').delete().eq('id', member.id)
    redirect(`${LIST}?error=${error ? 'failed' : 'gone'}`)
  }
  redirect(`${LIST}?done=approved`)
}

export async function reject(formData: FormData) {
  await requireAdmin()
  const userId = targetId(formData)
  const reason = String(formData.get('reason') ?? '').trim()
  if (!reason) redirect(`${LIST}?error=reason`)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounts')
    .update({ status: '거절', reject_reason: reason })
    .eq('user_id', userId)
    .eq('status', '대기')
    .select('user_id')
  if (error) redirect(`${LIST}?error=failed`)
  if (!data?.length) redirect(`${LIST}?error=gone`)
  redirect(`${LIST}?done=rejected`)
}
