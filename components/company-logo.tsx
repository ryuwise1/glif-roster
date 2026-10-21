'use client'

import { useEffect, useRef, useState } from 'react'
import { logoSrc } from '@/lib/companies'

// 회사 로고. 도메인이 없거나, 로고를 못 찾았거나, 너무 작은(16px 이하) 아이콘이면 회사 이름 첫 글자를 보여 준다.
// 구글 아이콘은 못 찾으면 16px 기본 아이콘을 주므로 크기로 걸러 낸다.
const MIN_SIZE = 17

export function CompanyLogo({ company, domain, size = 48 }: { company: string; domain: string | null; size?: number }) {
  const [ok, setOk] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  const check = (el: HTMLImageElement) => setOk(el.naturalWidth >= MIN_SIZE)
  // 화면이 준비되기 전에 이미 다 받은 이미지는 onLoad 가 오지 않으므로 한 번 더 본다
  useEffect(() => {
    const el = img.current
    if (el?.complete) setOk(el.naturalWidth >= MIN_SIZE)
  }, [domain])

  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded bg-paper text-lg font-bold text-navy"
    >
      {!ok && company.slice(0, 1)}
      {domain && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={logoSrc(domain)}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={(e) => check(e.currentTarget)}
          onError={() => setOk(false)}
          className={`absolute inset-0 size-full border border-line bg-white object-contain p-1.5 ${ok ? '' : 'invisible'}`}
        />
      )}
    </span>
  )
}
