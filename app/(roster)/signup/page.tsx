import { Suspense } from 'react'
import { requireUnregistered } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ErrorNote, Shell, buttonClass, inputClass, subtleButtonClass } from '@/components/shell'
import { signOut } from '../actions'
import { submitSignup } from './actions'

const ERRORS: Record<string, string> = {
  name: '목록에 없다면 이름을 적어 주세요.',
  choice: '본인을 고르거나 "목록에 없음"을 선택해 주세요.',
  taken: '이미 다른 계정과 연결된 분입니다. 본인이 맞다면 관리자에게 문의해 주세요.',
  failed: '신청을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}

export default function SignupPage({ searchParams }: PageProps<'/signup'>) {
  return (
    <Suspense fallback={<Shell title="가입 신청">{null}</Shell>}>
      <Signup searchParams={searchParams} />
    </Suspense>
  )
}

async function Signup({ searchParams }: { searchParams: PageProps<'/signup'>['searchParams'] }) {
  const access = await requireUnregistered()
  const params = await searchParams
  const cohort = typeof params.cohort === 'string' && /^\d+$/.test(params.cohort) ? Number(params.cohort) : null
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined

  const supabase = await createClient()
  const { data: cohorts } = await supabase.rpc('signup_cohorts')
  const options = (cohorts as number[] | null) ?? []
  const valid = cohort !== null && options.includes(cohort)
  const { data: candidates } = valid
    ? await supabase.rpc('signup_candidates', { p_cohort: cohort })
    : { data: null }
  const people = (candidates as { id: string; name: string }[] | null) ?? []

  return (
    <Shell title="가입 신청">
      <p className="mb-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {access.email ?? '로그인한 계정'}으로 로그인했습니다. 기수를 고르고 본인 이름을 선택하면 관리자에게 승인 요청이 갑니다.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* 1단계: 기수 고르기 (자바스크립트 없이도 되도록 일반 GET 폼) */}
      <form method="get" className="mb-6 flex gap-2">
        <label className="sr-only" htmlFor="cohort">기수</label>
        <select id="cohort" name="cohort" defaultValue={valid ? String(cohort) : ''} className={inputClass} required>
          <option value="" disabled>기수 선택</option>
          {options.map((c) => (
            <option key={c} value={c}>{c}기</option>
          ))}
        </select>
        <button type="submit" className={`${subtleButtonClass} shrink-0`}>이름 보기</button>
      </form>

      {/* 2단계: 이름 고르기 */}
      {valid && (
        <form action={submitSignup} className="space-y-3">
          <input type="hidden" name="cohort" value={cohort} />
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{cohort}기에서 본인을 선택하세요</legend>
            {people.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-zinc-200 px-3 dark:border-zinc-800">
                <input type="radio" name="member" value={p.id} required />
                <span className="text-sm">{p.name}</span>
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-zinc-200 px-3 dark:border-zinc-800">
              <input type="radio" name="member" value="none" required />
              <span className="text-sm">목록에 없음</span>
            </label>
          </fieldset>
          <div>
            <label htmlFor="name" className="mb-1 block text-xs text-zinc-500">목록에 없다면 이름을 직접 적어 주세요</label>
            <input id="name" name="name" type="text" maxLength={30} className={inputClass} />
          </div>
          <button type="submit" className={`${buttonClass} w-full`}>가입 신청</button>
        </form>
      )}

      <form action={signOut} className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button type="submit" className="text-sm text-zinc-500 underline">다른 계정으로 로그인</button>
      </form>
    </Shell>
  )
}
