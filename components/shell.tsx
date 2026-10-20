import type { ReactNode } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/(roster)/actions'

// 연명부 화면 공통 부품. GLIF 공식 홈페이지처럼 남색·흰색 위주로 단정하게 꾸민다.

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

function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 bg-navy">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
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
export function Shell({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className={`${cardClass} w-full max-w-md sm:p-8`}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <Rule />
          {children}
        </div>
      </main>
      <Footer />
    </>
  )
}

// 로그인 뒤 화면: 상단 바(메뉴) + 남색 제목 띠(banner) + 본문
export function AppFrame({
  email,
  isAdmin,
  active,
  banner,
  children,
}: {
  email: string | null
  isAdmin: boolean
  active?: 'members' | 'approvals'
  banner?: ReactNode
  children: ReactNode
}) {
  const nav = [
    { key: 'members', href: '/members', label: '연명부', show: true },
    { key: 'approvals', href: '/admin/approvals', label: '가입 승인', show: isAdmin },
  ] as const
  return (
    <>
      <TopBar>
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
      {banner}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">{children}</main>
      <Footer />
    </>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">
        <span className="font-display font-semibold tracking-wide text-slate">GLIF</span> · 성균관대학교 금융투자학회 · 학회원 전용 연명부
      </div>
    </footer>
  )
}

// 영문 소제목 (홈페이지의 FOUNDATION·ADVANCED 같은 줄)
export function Eyebrow({ children, onDark }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p className={`mb-1.5 font-display text-[11px] font-bold uppercase tracking-[.2em] ${onDark ? 'text-white/70' : 'text-navy'}`}>{children}</p>
  )
}

// 제목 아래 짧은 남색 선
export function Rule({ onDark }: { onDark?: boolean }) {
  return <span aria-hidden className={`mb-5 mt-3 block h-0.5 w-6 ${onDark ? 'bg-white/80' : 'bg-navy'}`} />
}

// 화면 맨 위 남색 띠 (제목·설명·숫자)
export function Banner({ eyebrow, title, desc, children }: { eyebrow: string; title: string; desc?: string; children?: ReactNode }) {
  return (
    <section className="bg-navy-deep text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Eyebrow onDark>{eyebrow}</Eyebrow>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <Rule onDark />
        {desc && <p className="-mt-1 max-w-2xl text-sm leading-6 text-white/75">{desc}</p>}
        {children}
      </div>
    </section>
  )
}

// 남색 띠 안의 숫자 줄
export function Stats({ items }: { items: { label: string; value: ReactNode; unit?: string }[] }) {
  return (
    <dl className="mt-6 flex flex-wrap gap-y-3">
      {items.map((s, i) => (
        <div key={s.label} className={`pr-6 sm:pr-10 ${i > 0 ? 'border-l border-white/20 pl-6 sm:pl-10' : ''}`}>
          <dt className="text-xs text-white/60">{s.label}</dt>
          <dd className="font-display text-2xl font-bold">
            {s.value}
            {s.unit && <span className="ml-0.5 font-sans text-sm font-medium text-white/70">{s.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// 띠가 없는 화면의 제목
export function PageHeader({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <span aria-hidden className="mt-3 block h-0.5 w-6 bg-navy" />
        {desc && <p className="mt-3 text-sm text-slate">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

// 카드 안 소제목
export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b border-line pb-3">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      </div>
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
  return <span className={`inline-flex items-center rounded-sm border px-1.5 py-px text-[11px] font-semibold ${tones[tone]}`}>{children}</span>
}

// 기수 회장·부회장 표시
export function RoleBadge({ role }: { role: '회장' | '부회장' | null }) {
  if (!role) return null
  return <Badge tone={role === '회장' ? 'navy' : 'outline'}>{role}</Badge>
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
