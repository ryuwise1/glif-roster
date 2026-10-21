'use server'

import { redirect } from 'next/navigation'
import { requireApproved } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { dbErrorMessage, parseCareer, parseMyInfo } from '@/lib/member-form'
import type { FormState } from '../admin/members/actions'

// 내 정보 수정. 고칠 학회원은 폼이 아니라 로그인한 계정에서 정한다. DB 도 본인 행만 허용한다(0008).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function keep(formData: FormData, error: string): FormState {
  const values: Record<string, string[]> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string') (values[k] ??= []).push(v)
  return { error, values }
}

async function myMemberId(): Promise<string> {
  const { account } = await requireApproved()
  if (!account.member_id) redirect('/me')
  return account.member_id
}

export async function updateMyInfo(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = await myMemberId()
  const parsed = parseMyInfo(formData)
  if (!parsed.ok) return keep(formData, parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.from('members').update(parsed.value).eq('id', id).select('id')
  if (error) return keep(formData, dbErrorMessage(error))
  if (!data?.length) return keep(formData, '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
  redirect('/me?done=saved')
}

// career_id 가 있으면 수정, 없으면 새로 추가한다
export async function saveMyCareer(_prev: FormState, formData: FormData): Promise<FormState> {
  const memberId = await myMemberId()
  const careerId = String(formData.get('career_id') ?? '')
  if (careerId && !UUID.test(careerId)) return keep(formData, '잘못된 요청입니다.')
  const parsed = parseCareer(formData)
  if (!parsed.ok) return keep(formData, parsed.error)

  const supabase = await createClient()
  const { data, error } = careerId
    ? await supabase.from('careers').update(parsed.value).eq('id', careerId).eq('member_id', memberId).select('id')
    : await supabase.from('careers').insert({ ...parsed.value, member_id: memberId }).select('id')
  if (error) return keep(formData, dbErrorMessage(error))
  if (!data?.length) return keep(formData, '이미 삭제된 경력입니다.')
  redirect('/me?done=career')
}

export async function deleteMyCareer(formData: FormData) {
  const memberId = await myMemberId()
  const careerId = String(formData.get('career_id') ?? '')
  if (!UUID.test(careerId)) redirect('/me')

  const supabase = await createClient()
  const { error } = await supabase.from('careers').delete().eq('id', careerId).eq('member_id', memberId)
  redirect(`/me?${error ? 'error=failed' : 'done=career-deleted'}`)
}
