import { describe, expect, it } from 'vitest'
import { filterMembers, paginate, parseFilters, PAGE_SIZE, type Career, type DirectoryMember } from '../lib/roster'

// 모두 가짜 데이터
const m = (id: string, name: string, cohort: number, cohort_role: DirectoryMember['cohort_role'] = null): DirectoryMember => ({
  id, name, cohort, cohort_role, department: null, student_year: null, phone: null, personal_email: null, work_email: null,
})
const c = (member_id: string, company: string, o: Partial<Career> = {}): Career => ({
  id: `${member_id}-${company}`, member_id, kind: '정규', is_current: true, industry: null, job_function: null,
  company, team: null, title: null, region: null, started_on: null, ended_on: null, ...o,
})

const members = [m('a', '가나다', 19), m('b', '라마바', 20, '부회장'), m('c', '사아자', 20, '회장'), m('d', '차카타', 18)]
const careers = [
  c('a', '가짜증권', { industry: '금융', job_function: '리서치' }),
  c('a', '옛날운용', { is_current: false, industry: '금융', job_function: '운용' }),
  c('b', '가짜컨설팅', { industry: '컨설팅', job_function: '기타', team: '전략팀' }),
]
const none = parseFilters({})

describe('목록 정렬', () => {
  it('1기부터 기수 오름차순, 같은 기수에서는 회장·부회장이 먼저 나온다', () => {
    expect(filterMembers(members, careers, none).map((r) => r.name)).toEqual(['차카타', '가나다', '사아자', '라마바'])
  })
})

describe('검색', () => {
  it('이름으로 찾고, 공백과 대소문자는 무시한다', () => {
    expect(filterMembers(members, careers, parseFilters({ q: ' 가 나다 ' })).map((r) => r.id)).toEqual(['a'])
  })
  it('현직뿐 아니라 전 직장 이름으로도 찾는다', () => {
    expect(filterMembers(members, careers, parseFilters({ q: '옛날' })).map((r) => r.id)).toEqual(['a'])
  })
  it('부서 이름으로도 찾는다', () => {
    expect(filterMembers(members, careers, parseFilters({ q: '전략' })).map((r) => r.id)).toEqual(['b'])
  })
  it('일치하는 것이 없으면 빈 목록이다', () => {
    expect(filterMembers(members, careers, parseFilters({ q: '없는회사' }))).toEqual([])
  })
})

describe('필터', () => {
  it('기수로 거른다', () => {
    expect(filterMembers(members, careers, parseFilters({ cohort: '20' })).map((r) => r.id)).toEqual(['c', 'b'])
  })
  it('업종은 현직 기준이다 (전 직장의 업종은 세지 않는다)', () => {
    expect(filterMembers(members, careers, parseFilters({ jobFunction: '운용' }))).toEqual([])
    expect(filterMembers(members, careers, parseFilters({ jobFunction: '리서치' })).map((r) => r.id)).toEqual(['a'])
  })
  it('조건은 함께 적용된다', () => {
    expect(filterMembers(members, careers, parseFilters({ industry: '금융', cohort: '20' }))).toEqual([])
    expect(filterMembers(members, careers, parseFilters({ industry: '금융', cohort: '19' })).map((r) => r.id)).toEqual(['a'])
  })
  it('행에는 현직과 전 직장이 나뉘어 담긴다', () => {
    const [row] = filterMembers(members, careers, parseFilters({ q: '가나다' }))
    expect(row.current.map((x) => x.company)).toEqual(['가짜증권'])
    expect(row.past.map((x) => x.company)).toEqual(['옛날운용'])
  })
  it('전 직장은 최근에 시작한 것부터, 날짜 없는 것은 뒤에 둔다', () => {
    const past = [
      c('d', '날짜없음', { is_current: false }),
      c('d', '예전회사', { is_current: false, started_on: '2015-03-01' }),
      c('d', '최근회사', { is_current: false, started_on: '2020-03-01' }),
    ]
    const [row] = filterMembers(members, past, parseFilters({ q: '차카타' }))
    expect(row.past.map((x) => x.company)).toEqual(['최근회사', '예전회사', '날짜없음'])
  })
})

describe('주소 값 해석', () => {
  it('이상한 값은 무시하고 기본값을 쓴다', () => {
    expect(parseFilters({ cohort: 'abc', page: '-1', q: ['x', 'y'] })).toEqual({
      q: '', cohort: null, industry: '', jobFunction: '', page: 1,
    })
  })
  it('검색어는 50자까지만 쓴다', () => {
    expect(parseFilters({ q: 'ㄱ'.repeat(80) }).q).toHaveLength(50)
  })
})

describe('쪽 나누기', () => {
  const rows = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, i) => i)
  it('쪽마다 정해진 수만큼 돌려주고 마지막 쪽을 넘으면 마지막 쪽으로 맞춘다', () => {
    expect(paginate(rows, 1).items).toHaveLength(PAGE_SIZE)
    expect(paginate(rows, 3).items).toEqual([PAGE_SIZE * 2])
    expect(paginate(rows, 99)).toMatchObject({ page: 3, pages: 3 })
  })
  it('빈 목록도 1쪽으로 센다', () => {
    expect(paginate([], 1)).toEqual({ items: [], pages: 1, page: 1 })
  })
})
