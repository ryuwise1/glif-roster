'use server'

import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { parseDomain } from '@/lib/companies'

const back = (q: string) => redirect(`/admin/companies?${q}`)

function companyOf(formData: FormData): string {
  const company = String(formData.get('company') ?? '').trim()
  if (!company || company.length > 200) back('error=failed')
  return company
}

// 회사 로고 도메인 저장. 주소를 통째로 붙여 넣어도 도메인만 남긴다.
export async function saveDomain(formData: FormData) {
  await requireAdmin()
  const company = companyOf(formData)
  const domain = parseDomain(String(formData.get('domain') ?? ''))
  if (!domain) back('error=domain')
  const supabase = await createClient()
  const { error } = await supabase.from('company_domains').upsert({ company, domain })
  back(error ? 'error=failed' : 'done=saved')
}

export async function clearDomain(formData: FormData) {
  await requireAdmin()
  const company = companyOf(formData)
  const supabase = await createClient()
  const { error } = await supabase.from('company_domains').delete().eq('company', company)
  back(error ? 'error=failed' : 'done=cleared')
}
