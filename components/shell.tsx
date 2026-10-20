import type { ReactNode } from 'react'

// 연명부 화면 공통 틀: 가운데 정렬된 카드 하나. 휴대폰에서도 보이도록 좁은 폭을 기준으로 한다.
export function Shell({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className="flex flex-1 items-start justify-center bg-zinc-50 px-4 py-10 dark:bg-black sm:items-center">
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800`}
      >
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
        {children}
      </div>
    </main>
  )
}

export const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'
export const subtleButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
export const inputClass =
  'min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50'

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {children}
    </p>
  )
}
