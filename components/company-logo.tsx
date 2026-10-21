'use client'

import { useEffect, useRef, useState } from 'react'
import { logoSrc } from '@/lib/companies'

// 회사 로고. 도메인이 없거나 로고를 못 찾으면(서버가 404) 회사 이름 첫 글자를 보여 준다.
// 16px 처럼 작은 아이콘은 상자를 억지로 채우면 뭉개지므로, 정수 배로만 키워 가운데에 둔다.
// 가로로 긴 글자 로고는 작아지지 않게 여백을 줄여 상자 너비를 거의 다 쓴다.
const PAD = 6

export function CompanyLogo({ company, domain, size = 48 }: { company: string; domain: string | null; size?: number }) {
  const [state, setState] = useState({ domain, ok: false, w: 0, h: 0 })
  // 도메인이 바뀌면(관리자가 저장한 뒤 등) 다시 본다
  if (state.domain !== domain) setState({ domain, ok: false, w: 0, h: 0 })
  const src = domain ? logoSrc(domain) : null
  const img = useRef<HTMLImageElement>(null)

  const judge = (el: HTMLImageElement | null, failed = false) => {
    if (!el) return
    const w = failed ? 0 : el.naturalWidth
    const h = failed ? 0 : el.naturalHeight
    setState((s) => (s.domain === domain ? { ...s, ok: w > 0, w, h } : s))
  }
  // 화면이 준비되기 전에 이미 다 받은 이미지는 onLoad 가 오지 않으므로 한 번 더 본다
  useEffect(() => {
    const el = img.current
    if (el?.complete && el.naturalWidth > 0) judge(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const wide = state.h > 0 && state.w >= state.h * 2
  const inner = wide ? size - 4 : size - PAD * 2
  // 작은 아이콘: 2배·3배처럼 정수 배로 키운 크기. 충분히 크면 상자 안쪽을 채운다
  const shown = !wide && state.w > 0 && state.w * 2 <= inner ? state.w * Math.floor(inner / state.w) : inner

  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded text-lg font-bold text-navy ${state.ok ? 'border border-line bg-white' : 'bg-paper'}`}
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
          style={{ width: shown, height: shown }}
          className={`absolute inset-0 m-auto object-contain ${state.ok ? '' : 'invisible'}`}
        />
      )}
    </span>
  )
}
