import type { ReactNode } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/(roster)/actions'

// 연명부 화면 공통 부품. GLIF 공식 홈페이지의 남색·흰색과 글꼴을 따른다.

export const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-deep disabled:opacity-50'
export const subtleButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:border-navy hover:text-navy'
export const dangerButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded border border-danger/40 bg-white px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/5'
export const inputClass =
  'min-h-11 w-full rounded border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy'
export const cardClass = 'rounded-lg border border-line bg-white p-5 sm:p-6'
export const labelClass = 'mb-1.5 block text-xs font-semibold text-slate'

function Logo({ variant, className = '' }: { variant: 'white' | 'navy'; className?: string }) {
  // 원본 비율 480×254
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/glif-logo-${variant}.png`} alt="GLIF" width={480} height={254} className={`h-8 w-auto ${className}`} />
}

function TopBar({ children, wide }: { children?: ReactNode; wide?: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-navy">
      <div className={`mx-auto flex h-16 w-full ${wide ? 'max-w-[90rem]' : 'max-w-6xl'} items-center gap-4 px-4 sm:px-6`}>
        <Link href="/" className="flex items-center gap-3" aria-label="GLIF 연명부 처음으로">
          <Logo variant="white" />
          <span className="hidden border-l border-white/25 pl-3 text-sm font-semibold text-white sm:inline">연명부</span>
        </Link>
        {children}
      </div>
    </header>
  )
}

// 로그인 전 화면(로그인·가입 신청·승인 대기): 상단 바 + 가운데 카드
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className={`${cardClass} w-full max-w-md sm:p-8`}>
          <h1 className="mb-4 text-xl font-bold tracking-tight text-ink">{title}</h1>
          {children}
        </div>
      </main>
      <Footer />
    </>
  )
}

// 로그인 뒤 화면: 상단 바(메뉴) + 본문. 표가 넓은 화면은 wide 로 폭을 늘린다.
export function AppFrame({
  email,
  isAdmin,
  active,
  wide,
  children,
}: {
  email: string | null
  isAdmin: boolean
  active?: 'members' | 'approvals'
  wide?: boolean
  children: ReactNode
}) {
  const nav = [
    { key: 'members', href: '/members', label: '연명부', show: true },
    { key: 'approvals', href: '/admin/approvals', label: '가입 승인', show: isAdmin },
  ] as const
  return (
    <>
      <TopBar wide={wide}>
        <nav className="ml-auto flex h-full items-stretch gap-1 sm:gap-4" aria-label="주 메뉴">
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <Link
                key={n.key}
                href={n.href}
                aria-current={active === n.key ? 'page' : undefined}
                className={`flex items-center border-b-2 px-2 text-sm font-medium transition-colors ${
                  active === n.key ? 'border-white text-white' : 'border-transparent text-white/70 hover:text-white'
                }`}
              >
                {n.label}
              </Link>
            ))}
        </nav>
        <div className="flex items-center gap-3">
          {email && <span className="hidden max-w-48 truncate text-xs text-white/60 lg:inline">{email}</span>}
          <form action={signOut}>
            <button type="submit" className="rounded border border-white/30 px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white">
              로그아웃
            </button>
          </form>
        </div>
      </TopBar>
      <main className={`mx-auto w-full ${wide ? 'max-w-[90rem]' : 'max-w-6xl'} flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8`}>{children}</main>
      <Footer />
    </>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">GLIF 성균관대학교 금융투자학회</div>
    </footer>
  )
}

export function PageHeader({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {desc && <p className="mt-1 text-sm text-slate">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

// 카드 안 소제목
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {action}
    </div>
  )
}

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'navy' | 'outline' | 'ok' }) {
  const tones = {
    plain: 'border-line bg-paper text-slate',
    navy: 'border-navy bg-navy text-white',
    outline: 'border-navy/40 bg-white text-navy',
    ok: 'border-ok/30 bg-ok/5 text-ok',
  }
  // 글자 줄과 가운데가 맞도록 높이를 고정하고 줄 간격을 없앤다
  return <span className={`inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-[11px] font-semibold leading-none ${tones[tone]}`}>{children}</span>
}

// 기수 회장·부회장 표시
export function RoleBadge({ role }: { role: '회장' | '부회장' | null }) {
  if (!role) return null
  return <Badge tone={role === '회장' ? 'navy' : 'outline'}>{role}</Badge>
}

// "19기 [회장]" 처럼 기수와 역할을 한 줄에 가운데 맞춰 놓는다
export function CohortLabel({ cohort, role, className = '' }: { cohort: number; role: '회장' | '부회장' | null; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap leading-5 ${className}`}>
      {cohort}기
      <RoleBadge role={role} />
    </span>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-4 rounded border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
      {children}
    </p>
  )
}

export function DoneNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mb-4 rounded border border-ok/30 bg-ok/5 px-4 py-3 text-sm font-medium text-ok">
      {children}
    </p>
  )
}
