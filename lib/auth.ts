import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AccountRow = {
  status: '대기' | '승인' | '거절'
  role: '학회원' | '관리자' | '최고관리자'
  member_id: string | null
  claimed_name: string | null
  claimed_cohort: number | null
  reject_reason: string | null
}

export type Access =
  | { state: 'anon' }
  | { state: 'unregistered'; userId: string; email: string | null }
  | { state: 'registered'; userId: string; email: string | null; account: AccountRow }

// 지금 로그인한 사람이 어떤 상태인지 읽는다. getUser() 는 Supabase 서버에 토큰을 확인하므로 쿠키만 믿지 않는다.
export async function getAccess(): Promise<Access> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return { state: 'anon' }

  const { data: account } = await supabase
    .from('accounts')
    .select('status, role, member_id, claimed_name, claimed_cohort, reject_reason')
    .eq('user_id', user.id)
    .maybeSingle<AccountRow>()
  if (!account) return { state: 'unregistered', userId: user.id, email: user.email ?? null }
  return { state: 'registered', userId: user.id, email: user.email ?? null, account }
}

// 상태에 맞는 첫 화면 주소
export function homeFor(access: Access): string {
  if (access.state === 'anon') return '/login'
  if (access.state === 'unregistered') return '/signup'
  return access.account.status === '승인' ? '/members' : '/pending'
}

// 로그인했지만 아직 가입 신청을 하지 않은 사람만 통과
export async function requireUnregistered() {
  const access = await getAccess()
  if (access.state !== 'unregistered') redirect(homeFor(access))
  return access
}

// 가입 신청을 했고 아직 승인되지 않은 사람만 통과 (대기·거절 안내 화면용)
export async function requireWaiting() {
  const access = await getAccess()
  if (access.state !== 'registered' || access.account.status === '승인') redirect(homeFor(access))
  return access
}

export async function requireApproved() {
  const access = await getAccess()
  if (access.state !== 'registered' || access.account.status !== '승인') redirect(homeFor(access))
  return access
}

export async function requireAdmin() {
  const access = await requireApproved()
  if (access.account.role === '학회원') redirect('/members')
  return access
}
