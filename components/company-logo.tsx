'use client'

import { useEffect, useRef, useState } from 'react'
import { logoSrcs } from '@/lib/companies'

// 회사 로고. 도메인이 없거나, 로고를 못 찾았거나, 너무 작은(16px 이하) 아이콘이면 회사 이름 첫 글자를 보여 준다.
// 구글 아이콘은 못 찾으면 16px 기본 아이콘을 주므로 크기로 걸러 내고, 다음 주소가 있으면 그 주소를 시도한다.
const MIN_SIZE = 17

export function CompanyLogo({ company, domain, size = 48 }: { company: string; domain: string | null; size?: number }) {
  const [state, setState] = useState({ domain, at: 0, ok: false })
  // 도메인이 바뀌면(관리자가 저장한 뒤 등) 처음 주소부터 다시 본다
  if (state.domain !== domain) setState({ domain, at: 0, ok: false })
  const srcs = domain ? logoSrcs(domain) : []
  const src = srcs[state.at]
  const img = useRef<HTMLImageElement>(null)

  const judge = (el: HTMLImageElement | null, failed = false) => {
    if (!el) return
    const good = !failed && el.naturalWidth >= MIN_SIZE
    // onLoad 와 위의 확인이 같은 그림을 두 번 판단해도 한 칸만 넘어가도록, 지금 주소의 결과만 받는다
    setState((s) => {
      if (srcs[s.at] !== el.src) return s
      if (good) return { ...s, ok: true }
      return s.at + 1 < srcs.length ? { ...s, at: s.at + 1, ok: false } : { ...s, ok: false }
    })
  }
  // 화면이 준비되기 전에 이미 다 받은 이미지는 onLoad 가 오지 않으므로 한 번 더 본다
  useEffect(() => {
    const el = img.current
    if (el?.complete && el.naturalWidth > 0) judge(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded bg-paper text-lg font-bold text-navy"
    >
      {!state.ok && company.slice(0, 1)}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          ref={img}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={(e) => judge(e.currentTarget)}
          onError={(e) => judge(e.currentTarget, true)}
          className={`absolute inset-0 size-full border border-line bg-white object-contain p-1.5 ${state.ok ? '' : 'invisible'}`}
        />
      )}
    </span>
  )
}
