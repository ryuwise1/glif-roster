import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createDb } from './db/harness'
// @ts-expect-error .mjs 스크립트라 타입 선언이 없다
import { parseMembers, toSql } from '../scripts/import/glifskku-members.mjs'

// 모두 가짜 데이터. 실제 사이트와 같은 모양의 HTML 이다.
const card = (name: string, dept: string) =>
  `<div class="member-card"><div class="member-photo"></div><p class="member-name">${name}</p><p class="member-dept">${dept}</p></div>`
const photoCard = (name: string, dept: string) => `
  <div class="member-card">
    <div class="member-photo has-photo"><img src="a.jpg" alt="x" /></div>
    <p class="member-name">${name}</p>
    <p class="member-dept">${dept}</p>
  </div>`

const HTML = [
  card('1기 가짜하나(회장)', '글로벌경제 10'),
  card('1기 가짜둘', '글로벌경영'),
  photoCard('19기 가짜셋(부회장)', '글로벌경영 21'),
  photoCard("19기 가짜'넷", '글로벌경제 24'),
].join('\n')

describe('명단 읽기', () => {
  it('기수·이름·직책·학과·학번을 읽는다 (사진이 있는 카드도 같다)', () => {
    const { members, problems } = parseMembers(HTML)
    expect(problems).toEqual([])
    expect(members).toEqual([
      { cohort: 1, name: '가짜하나', role: '회장', department: '글로벌경제', studentYear: 10 },
      { cohort: 1, name: '가짜둘', role: null, department: '글로벌경영', studentYear: null },
      { cohort: 19, name: '가짜셋', role: '부회장', department: '글로벌경영', studentYear: 21 },
      { cohort: 19, name: "가짜'넷", role: null, department: '글로벌경제', studentYear: 24 },
    ])
  })

  it('알 수 없는 학과와 같은 기수의 같은 이름은 문제로 알려 준다', () => {
    const { members, problems } = parseMembers(card('2기 가짜다', '법학 12') + card('2기 가짜다', '글로벌경제 12'))
    expect(members).toHaveLength(1)
    expect(problems.some((p) => p.includes('학과를 알 수 없음'))).toBe(true)
    expect(problems.some((p) => p.includes('같은 이름이 두 번'))).toBe(true)
  })

  it('명단이 하나도 없는 페이지는 빈 목록이다', () => {
    expect(parseMembers('<html></html>').members).toEqual([])
  })
})

describe('만든 SQL', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await createDb()
  })
  afterEach(async () => {
    await db.close()
  })

  const sql = () => toSql(parseMembers(HTML).members)
  const all = async () =>
    (await db.query(`select name, cohort, cohort_role, department, student_year from public.members order by cohort, name`)).rows

  it('SQL 편집기(postgres)에서 실행되고 사람이 들어간다 (따옴표가 든 이름 포함)', async () => {
    await db.exec(sql())
    expect(await all()).toEqual([
      { name: '가짜둘', cohort: 1, cohort_role: null, department: '글로벌경영', student_year: null },
      { name: '가짜하나', cohort: 1, cohort_role: '회장', department: '글로벌경제', student_year: 10 },
      { name: "가짜'넷", cohort: 19, cohort_role: null, department: '글로벌경제', student_year: 24 },
      { name: '가짜셋', cohort: 19, cohort_role: '부회장', department: '글로벌경영', student_year: 21 },
    ])
  })

  it('여러 번 실행해도 사람이 늘지 않는다', async () => {
    await db.exec(sql())
    await db.exec(sql())
    expect(await all()).toHaveLength(4)
  })

  it('이미 있는 사람은 새로 만들지 않고 비어 있는 칸만 채운다 (본인이 먼저 만든 행 포함)', async () => {
    await db.exec(`insert into public.members (name, cohort, department) values ('가짜셋', 19, '글로벌경제')`)
    await db.exec(sql())
    const rows = await all()
    expect(rows.filter((r) => r.name === '가짜셋')).toEqual([
      { name: '가짜셋', cohort: 19, cohort_role: '부회장', department: '글로벌경제', student_year: 21 },
    ])
    expect(rows).toHaveLength(4)
  })
})
