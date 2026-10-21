'use client'

import { useEffect, useRef, useState } from 'react'
import { HOMEPAGE } from '@/components/shell'

// 홈페이지(glifskku.com)에 올라간 학회원 사진. 사진이 없으면 이름 첫 글자를 보여 준다.
function ordinal(n: number): string {
  const rest = n % 100
  if (rest >= 11 && rest <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export function MemberPhoto({ name, cohort, size = 96 }: { name: string; cohort: number; size?: number }) {
  const [failed, setFailed] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  // 화면이 준비되기 전에 이미 실패한 사진은 onError가 오지 않으므로 한 번 더 본다
  useEffect(() => {
    const el = img.current
    if (el && el.complete && el.naturalWidth === 0) setFailed(true)
  }, [])
  const box = { width: size, height: size }
  if (failed) {
    return (
      <span style={box} className="flex shrink-0 items-center justify-center rounded-full bg-navy text-2xl font-bold text-white">
        {name.slice(0, 1)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={`${HOMEPAGE}/assets/members/${ordinal(cohort)}/${encodeURIComponent(name)}.jpg`}
      alt={`${name} 사진`}
      style={box}
      className="shrink-0 rounded-full border border-line bg-paper object-cover"
      onError={() => setFailed(true)}
    />
  )
}
