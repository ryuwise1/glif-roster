import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAccess, homeFor } from '@/lib/auth'
import { ErrorNote, Shell, buttonClass } from '@/components/shell'
import { signInWithGoogle } from '../actions'

const ERRORS: Record<string, string> = {
  start: '구글 로그인을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  callback: '로그인을 마치지 못했습니다. 다시 로그인해 주세요.',
}

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <Suspense fallback={<Shell title="GLIF 연명부">{null}</Shell>}>
      <Login searchParams={searchParams} />
    </Suspense>
  )
}

async function Login({ searchParams }: { searchParams: PageProps<'/login'>['searchParams'] }) {
  const access = await getAccess()
  if (access.state !== 'anon') redirect(homeFor(access))
  const { error } = await searchParams
  const message = typeof error === 'string' ? ERRORS[error] : undefined

  return (
    <Shell title="GLIF 연명부">
      <p className="mb-6 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        GLIF 학회원 전용 연명부입니다. 구글 계정으로 로그인한 뒤 가입을 신청하면, 관리자가 승인한 분만 볼 수 있습니다.
      </p>
      {message && <ErrorNote>{message}</ErrorNote>}
      <form action={signInWithGoogle}>
        <button type="submit" className={`${buttonClass} w-full`}>
          구글로 로그인
        </button>
      </form>
    </Shell>
  )
}
