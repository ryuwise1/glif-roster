'use server'

import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { dbErrorMessage, parseCareer, parseMember } from '@/lib/member-form'

// 폼 상태. 실패하면 오류와 함께 입력값을 돌려줘 다시 적지 않아도 되게 한다.
export type FormState = { error?: string; values?: Record<string, string[]> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function keep(formData: FormData, error: string): FormState {
  const values: Record<string, string[]> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string') (values[k] ??= []).push(v)
  return { error, values }
}

function idOf(formData: FormData, key: string): string | null {
  const id = String(formData.get(key) ?? '')
  return UUID.test(id) ? id : null
}

export async function createMember(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin()
  const parsed = parseMember(formData)
  if (!parsed.ok) return keep(formData, parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.from('members').insert(parsed.value).select('id').single()
  if (error || !data) return keep(formData, error ? dbErrorMessage(error) : '저장하지 못했습니다.')
  redirect(`/admin/members/${data.id}?done=created`)
}

export async function updateMember(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin()
  const id = idOf(formData, 'id')
  if (!id) return keep(formData, '잘못된 요청입니다.')
  const parsed = parseMember(formData)
  if (!parsed.ok) return keep(formData, parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.from('members').update(parsed.value).eq('id', id).select('id')
  if (error) return keep(formData, dbErrorMessage(error))
  if (!data?.length) return keep(formData, '이미 삭제된 학회원입니다.')
  redirect(`/admin/members/${id}?done=saved`)
}

// 학회원 삭제. 경력은 DB 에서 함께 지워지고, 계정이 연결된 학회원은 DB 트리거가 막는다.
export async function deleteMember(formData: FormData) {
  await requireAdmin()
  const id = idOf(formData, 'id')
  if (!id) redirect('/members')

  const supabase = await createClient()
  const { data, error } = await supabase.from('members').delete().eq('id', id).select('id')
  if (error) redirect(`/admin/members/${id}?error=${error.code === 'P0001' || error.code === '23503' ? 'linked' : 'failed'}`)
  if (!data?.length) redirect(`/admin/members/${id}?error=failed`)
  redirect('/members?done=deleted')
}

// 경력 추가·수정. career_id 가 있으면 수정, 없으면 새로 추가한다.
export async function saveCareer(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin()
  const memberId = idOf(formData, 'member_id')
  if (!memberId) return keep(formData, '잘못된 요청입니다.')
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
  redirect(`/admin/members/${memberId}?done=career`)
}

export async function deleteCareer(formData: FormData) {
  await requireAdmin()
  const memberId = idOf(formData, 'member_id')
  const careerId = idOf(formData, 'career_id')
  if (!memberId || !careerId) redirect('/members')

  const supabase = await createClient()
  const { error } = await supabase.from('careers').delete().eq('id', careerId).eq('member_id', memberId)
  redirect(`/admin/members/${memberId}?${error ? 'error=failed' : 'done=career-deleted'}`)
}
