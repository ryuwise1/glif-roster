import { describe, expect, it } from 'vitest'
import { dbErrorMessage, parseCareer, parseMember } from '../lib/member-form'

function form(entries: Record<string, string | string[]>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) for (const x of [v].flat()) f.append(k, x)
  return f
}

describe('parseMember', () => {
  it('빈 칸은 null 로, 휴대폰은 010-0000-0000 꼴로 맞춘다', () => {
    const r = parseMember(form({ name: ' 홍길동 ', cohort: '5', phone: '010 1234 5678', department: '', student_year: '08' }))
    expect(r).toEqual({
      ok: true,
      value: {
        name: '홍길동',
        cohort: 5,
        cohort_role: null,
        department: null,
        student_year: 8,
        phone: '010-1234-5678',
        personal_email: null,
        work_email: null,
        hidden_fields: [],
      },
    })
  })

  it('숨김 항목은 허용된 것만 남긴다', () => {
    const r = parseMember(form({ name: '홍길동', cohort: '1', hidden_fields: ['phone', 'work_email', 'name'] }))
    expect(r.ok && r.value.hidden_fields).toEqual(['phone', 'work_email'])
  })

  it.each([
    [{ name: ' ', cohort: '1' }, '이름'],
    [{ name: '홍길동', cohort: '0' }, '기수'],
    [{ name: '홍길동', cohort: '2.5' }, '기수'],
    [{ name: '홍길동', cohort: '1', cohort_role: '총무' }, '역할'],
    [{ name: '홍길동', cohort: '1', student_year: '100' }, '학번'],
    [{ name: '홍길동', cohort: '1', phone: '02-123-4567' }, '휴대폰'],
    [{ name: '홍길동', cohort: '1', personal_email: 'a@b' }, '개인 이메일'],
    [{ name: '홍길동', cohort: '1', work_email: 'a b@c.com' }, '직장 이메일'],
  ])('잘못된 값은 알아듣기 쉬운 말로 막는다 %#', (entries, word) => {
    const r = parseMember(form(entries))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain(word)
  })
})

describe('parseCareer', () => {
  it('월 입력을 그달 1일로 바꾸고 현직 체크를 읽는다', () => {
    const r = parseCareer(form({ kind: '인턴', company: '가나증권', started_on: '2024-03', ended_on: '2024-08', is_current: 'on', industry: '' }))
    expect(r).toEqual({
      ok: true,
      value: {
        kind: '인턴',
        is_current: true,
        industry: null,
        job_function: null,
        company: '가나증권',
        team: null,
        title: null,
        region: null,
        started_on: '2024-03-01',
        ended_on: '2024-08-01',
      },
    })
  })

  it.each([
    [{ kind: '알바', company: '가나' }, '구분'],
    [{ company: ' ' }, '회사'],
    [{ company: '가나', started_on: '2024-13' }, '기간'],
    [{ company: '가나', started_on: '2024-05', ended_on: '2024-04' }, '앞설 수 없습니다'],
  ])('잘못된 값은 막는다 %#', (entries, word) => {
    const r = parseCareer(form(entries))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain(word)
  })
})

describe('dbErrorMessage', () => {
  it('트리거 안내는 그대로, 제약 오류는 쉬운 말로 바꾼다', () => {
    expect(dbErrorMessage({ code: 'P0001', message: '기수는 현재 기수(20)보다 클 수 없습니다' })).toBe('기수는 현재 기수(20)보다 클 수 없습니다')
    expect(dbErrorMessage({ code: '23503', message: 'fk' })).toContain('목록에 없는')
    expect(dbErrorMessage({ code: '23514', message: 'check' })).toContain('형식')
    expect(dbErrorMessage({ code: 'XX000', message: 'boom' })).toContain('잠시 뒤')
  })
})
