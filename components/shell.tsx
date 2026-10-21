import type { ReactNode } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/(roster)/actions'

// 연명부 화면 공통 부품. GLIF 공식 홈페이지(glifskku.com)의 머리말·탭·푸터 모양을 그대로 따른다.

export const HOMEPAGE = 'https://glifskku.com'

export const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-deep disabled:opacity-50'
export const subtleButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:border-navy hover:text-navy'
export const dangerButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded border border-danger/40 bg-white px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/5'
export const inputClass =
  'min-h-11 w-full rounded border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy'
export const cardClass = 'rounded-md border border-line bg-white p-5 sm:p-6'
export const labelClass = 'mb-1.5 block text-xs font-semibold text-slate'

function Logo() {
  // 원본 비율 480×254
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/glif-logo-white.png" alt="GLIF" width={480} height={254} className="h-9 w-auto sm:h-10" />
}

function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 bg-navy">
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center gap-6 px-4 sm:h-[72px] sm:px-8">
        <Link href="/" aria-label="GLIF 연명부 처음으로">
          <Logo />
        </Link>
        {children}
      </div>
    </header>
  )
}

// 홈페이지 회원 화면과 같은 머리말: 캠퍼스 사진 + 남색 덮개 + 가운데 큰 제목
export function Hero({ title, sub, size = 'lg' }: { title: string; sub?: string; size?: 'lg' | 'sm' }) {
  return (
    <div className="relative overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/glif-campus.jpg"
        alt=""
        className={`block w-full object-cover object-[center_35%] ${size === 'lg' ? 'h-[clamp(180px,24vw,300px)]' : 'h-[clamp(140px,16vw,200px)]'}`}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(23,32,88,0.52)] px-5 text-center">
        <h1 className={`font-display font-bold leading-none tracking-[0.04em] text-white ${size === 'lg' ? 'text-[clamp(34px,5vw,64px)]' : 'text-[clamp(28px,3.6vw,44px)]'}`}>
          {title}
        </h1>
        {sub && <p className="mt-3 text-[clamp(13px,1.4vw,16px)] text-white/75">{sub}</p>}
      </div>
    </div>
  )
}

// 로그인 전 화면(로그인·가입 신청·승인 대기): 머리말 사진 + 가운데 카드
// brand: 제목 대신 카드 가운데에 GLIF 로고를 둔다 (로그인 화면)
export function Shell({ title, brand, children }: { title: string; brand?: boolean; children: ReactNode }) {
  return (
    <>
      <TopBar />
      <Hero title="Directory" sub="성균관대학교 금융투자학회 GLIF 학회원 연명부" size="sm" />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-14">
        <div className={`${cardClass} w-full max-w-md sm:p-8`}>
          {brand ? (
            <h2 className="mb-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/glif-logo-navy.png" alt={title} width={480} height={254} className="h-14 w-auto" />
            </h2>
          ) : (
            <h2 className="mb-4 text-xl font-bold tracking-tight text-ink">{title}</h2>
          )}
          {children}
        </div>
      </main>
      <Footer />
    </>
  )
}

// 로그인 뒤 화면: 상단 바(메뉴) + 머리말(hero) + 본문
export function AppFrame({
  email,
  isAdmin,
  active,
  hero,
  children,
}: {
  email: string | null
  isAdmin: boolean
  active?: 'members' | 'approvals' | 'me'
  hero?: ReactNode
  children: ReactNode
}) {
  const nav = [
    { key: 'members', href: '/members', label: '연명부', show: true },
    { key: 'approvals', href: '/admin/approvals', label: '가입 승인', show: isAdmin },
    { key: 'me', href: '/me', label: '내 정보', show: true },
  ] as const
  return (
    <>
      <TopBar>
        <nav className="ml-auto flex items-center gap-5 sm:gap-9" aria-label="주 메뉴">
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <Link
                key={n.key}
                href={n.href}
                aria-current={active === n.key ? 'page' : undefined}
                className={`text-[15px] transition-colors sm:text-base ${active === n.key ? 'font-bold text-white' : 'font-medium text-white/80 hover:text-white'}`}
              >
                {n.label}
              </Link>
            ))}
          <a href={HOMEPAGE} className="hidden text-base font-medium text-white/80 transition-colors hover:text-white sm:inline">
            홈페이지
          </a>
          <form action={signOut}>
            <button type="submit" title={email ?? undefined} className="text-[15px] font-medium text-white/60 transition-colors hover:text-white sm:text-base">
              로그아웃
            </button>
          </form>
        </nav>
      </TopBar>
      {hero}
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-20 pt-8 sm:px-8 sm:pt-10">{children}</main>
      <Footer />
    </>
  )
}

// 홈페이지 푸터와 같은 회색 띠
function Footer() {
  return (
    <footer className="bg-line/70">
      <div className="mx-auto w-full max-w-[90rem] px-4 py-7 text-center text-sm leading-7 text-slate sm:px-8">
        <p>성균관대학교 금융투자학회 GLIF</p>
        <p>
          이메일 : <a href="mailto:glifskku1398@gmail.com" className="hover:text-ink hover:underline">glifskku1398@gmail.com</a>
          {' / '}
          <a href={HOMEPAGE} className="hover:text-ink hover:underline">glifskku.com</a>
        </p>
        <p className="mt-1 text-xs text-muted">학회원 전용 페이지입니다. 연락처를 외부에 공유하지 말아 주세요.</p>
      </div>
    </footer>
  )
}

// 본문 위 제목 줄
export function PageHeader({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {desc && <div className="mt-1 text-sm text-slate">{desc}</div>}
      </div>
      {action}
    </div>
  )
}

// 홈페이지 기수 탭과 같은 밑줄 탭
export function UnderlineTabs({ children, label }: { children: ReactNode; label: string }) {
  return (
    <nav aria-label={label} className="scrollbar-none -mx-4 mb-6 flex overflow-x-auto border-b border-line px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {children}
    </nav>
  )
}

// small: 홈페이지 기수 탭의 둘째 줄(묶음 안의 기수)처럼 작게
export function underlineTabClass(active: boolean, small = false) {
  return `-mb-px shrink-0 border-b-2 transition-colors ${small ? 'px-3 py-2.5 text-sm' : 'px-4 py-3 text-[15px]'} ${
    active ? 'border-navy font-semibold text-ink' : 'border-transparent text-slate hover:text-ink'
  }`
}

export function UnderlineTab({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={underlineTabClass(active)}>
      {children}
    </Link>
  )
}

// 카드 안 소제목
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
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
