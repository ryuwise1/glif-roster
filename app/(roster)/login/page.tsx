import { Suspense, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAccess, homeFor } from '@/lib/auth'
import { ErrorNote, Shell } from '@/components/shell'
import { signInWithGoogle, signInWithKakao } from '../actions'

const ERRORS: Record<string, string> = {
  start: '로그인을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  callback: '로그인을 마치지 못했습니다. 다시 로그인해 주세요.',
}

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <Suspense fallback={<Shell title="GLIF 연명부" brand>{null}</Shell>}>
      <Login searchParams={searchParams} />
    </Suspense>
  )
}

async function Login({ searchParams }: { searchParams: PageProps<'/login'>['searchParams'] }) {
  const access = await getAccess()
  if (access.state !== 'anon') redirect(homeFor(access))
  const { error } = await searchParams
  const message = typeof error === 'string' ? ERRORS[error] : undefined
  const kakao = process.env.KAKAO_LOGIN === 'on'

  return (
    <Shell title="GLIF 연명부" brand>
      <div className="mb-6 space-y-1 break-keep text-balance text-center text-sm leading-6">
        <p className="text-ink">GLIF 구글 드라이브 계정으로 로그인하면 가입 신청 즉시 승인됩니다.</p>
        <p className="text-muted">다른 계정은 회장 승인 후 이용할 수 있습니다.</p>
      </div>
      {message && <ErrorNote>{message}</ErrorNote>}
      <div className="space-y-2.5">
        <form action={signInWithGoogle}>
          <LoginButton className="border border-line bg-white text-ink hover:border-navy" icon={<GoogleMark />}>
            Google로 로그인
          </LoginButton>
        </form>
        {kakao && (
          <form action={signInWithKakao}>
            {/* 카카오 디자인 안내: 바탕 #FEE500, 글자 85% 검정 */}
            <LoginButton className="bg-[#FEE500] text-black/85 hover:brightness-95" icon={<KakaoMark />}>
              카카오로 로그인
            </LoginButton>
          </form>
        )}
      </div>
    </Shell>
  )
}

function LoginButton({ className, icon, children }: { className: string; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="submit"
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded px-5 text-sm font-semibold transition ${className}`}
    >
      {icon}
      {children}
    </button>
  )
}

function KakaoMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5">
      <path fill="#000" d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.27 4.66 6.67l-.95 3.5c-.08.3.26.55.53.37l4.17-2.77c.52.06 1.05.1 1.59.1 5.52 0 10-3.54 10-7.87S17.52 3 12 3z" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
