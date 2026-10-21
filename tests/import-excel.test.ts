import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { createDb } from './db/harness'
import { buildImport, parsePeriod, readWorkbook, resolveMember, toSql } from '../scripts/import/excel-roster.mjs'

type Member = { name: string; cohort: number; studentYear: number | null }
// 모두 가짜 데이터
const MEMBERS: Member[] = [
  { name: '가짜하나', cohort: 19, studentYear: 21 },
  { name: '가짜둘', cohort: 18, studentYear: 20 },
  { name: '가짜셋', cohort: 18, studentYear: null },
  { name: '동명이', cohort: 12, studentYear: 18 },
  { name: '동명이', cohort: 13, studentYear: 19 },
  { name: '가짜회장', cohort: 19, studentYear: null },
  { name: '가짜인턴', cohort: 19, studentYear: null }, // 정규 현직 없이 인턴만
]

// 실제 파일과 같은 모양으로 가짜 엑셀을 만든다
async function makeFile(): Promise<string> {
  const wb = new ExcelJS.Workbook()

  const cur = wb.addWorksheet('GLIF 연명부-현직')
  cur.getCell('B4').value = '< 현직자 명단 >'
  cur.addRow([])
  cur.getRow(5).values = [undefined, '학번', '기수', '성함', '직장명', '부서명', '연락처']
  cur.getRow(6).values = [undefined, 21, 19, '가짜하나', '가짜증권', '리서치센터', 'real1@naver.com']
  cur.getRow(7).values = [undefined, 20, undefined, '가짜둘', '가짜은행', '-', 'work2@fakebank.co.kr']
  cur.getRow(8).values = [undefined, 20, undefined, '가짜셋', '가짜컨설팅', '전략팀', undefined] // 학번은 위 칸과 병합
  cur.mergeCells('B7:B8')
  cur.getRow(9).values = [undefined, 18, undefined, '동명이', '가짜공사', '기획팀', undefined] // 기수가 없고 학번 18 → 12기
  cur.getRow(10).values = [undefined, undefined, undefined, '명단없음', '가짜회사', undefined, undefined]
  cur.getRow(11).values = [undefined, 21, 19, '가짜하나', '옛날증권', '채권팀', undefined] // 회색 글씨 = 이전 직장
  for (let c = 2; c <= 7; c++) cur.getCell(11, c).font = { color: { argb: 'FFB7B7B7' } }
  cur.getCell('B12').value = '< 인턴 명단 >'
  cur.getRow(13).values = [undefined, '25\n하반기', '19기', '가짜하나', '가짜운용', '주식팀', '25.01~25.02']
  cur.getRow(14).values = [undefined, '25\n하반기', '18기', '가짜둘', '가짜투자', undefined, '24.下']
  cur.getRow(15).values = [undefined, '25\n하반기', '18기', '가짜셋', '가짜증권', undefined, '23.07~']
  cur.getRow(16).values = [undefined, '25\n하반기', '19기', '가짜인턴', '가짜A증권', 'IB팀', '24.01~24.02']
  cur.getRow(17).values = [undefined, '25\n하반기', '19기', '가짜인턴', '가짜B운용', undefined, '25.07~25.08']

  const off = wb.addWorksheet('GLIF 기수별 명단')
  off.getRow(3).values = [undefined, '기수', '직책', '성함', '번호', '기수별 인원']
  off.getRow(4).values = [undefined, '19기', '회장', '가짜회장', '010-1234-5678', '가짜하나', '가짜회장']
  off.getRow(5).values = [undefined, undefined, '부회장', undefined, undefined, '글제 21', '글경 22']
  off.getRow(6).values = [undefined, '18기', '회장', '가짜셋', '010-2222-3333', '가짜셋']
  off.getRow(7).values = [undefined, undefined, '부회장', undefined, undefined, '글제 20']

  const hist = wb.addWorksheet('GLIF 연명부-이력')
  hist.getRow(10).values = [undefined, '학번', '성함', '근무년도', '직장명', '부서명', '직위']
  hist.getRow(11).values = [undefined, 21, '가짜하나', '2021.10 ~ 현재', '가짜증권 홍콩', 'Research', 'Associate']
  hist.getRow(12).values = [undefined, undefined, undefined, '2019.7 ~ 2021.10', '가짜은행', 'Markets', 'Analyst']
  hist.getRow(13).values = [undefined, 20, '가짜둘', '2022.01~2022.06', '가짜운용', '운용팀', '인턴']

  const path = join(mkdtempSync(join(tmpdir(), 'glif-xlsx-')), 'roster.xlsx')
  await wb.xlsx.writeFile(path)
  return path
}

describe('기간 읽기', () => {
  it('여러 모양의 기간을 읽는다', () => {
    expect(parsePeriod('2021.10 ~ 현재')).toEqual({ startedOn: '2021-10-01', endedOn: null, current: true })
    expect(parsePeriod('2021.2~2021.7')).toEqual({ startedOn: '2021-02-01', endedOn: '2021-07-31', current: false })
    expect(parsePeriod('23.01~23.02')).toEqual({ startedOn: '2023-01-01', endedOn: '2023-02-28', current: false })
    expect(parsePeriod('24.下')).toEqual({ startedOn: '2024-07-01', endedOn: '2024-12-31', current: false })
    expect(parsePeriod('24.上')).toEqual({ startedOn: '2024-01-01', endedOn: '2024-06-30', current: false })
    expect(parsePeriod('23.07~')).toEqual({ startedOn: '2023-07-01', endedOn: null, current: false })
    expect(parsePeriod('알 수 없음')).toBeNull()
  })
})

describe('사람 맞추기', () => {
  it('이름이 유일하면 맞추고, 기수와 학번으로 동명이인을 가른다', () => {
    expect(resolveMember(MEMBERS, { name: '가짜하나', cohort: null, studentYear: null }).member.cohort).toBe(19)
    expect(resolveMember(MEMBERS, { name: '동명이', cohort: null, studentYear: 18 }).member.cohort).toBe(12)
    expect(resolveMember(MEMBERS, { name: '동명이', cohort: 13, studentYear: null }).member.cohort).toBe(13)
  })
  it('구분할 수 없거나 명단에 없으면 맞추지 않고 이유를 준다', () => {
    expect(resolveMember(MEMBERS, { name: '동명이', cohort: null, studentYear: null }).reason).toContain('동명이인')
    expect(resolveMember(MEMBERS, { name: '없는사람', cohort: null, studentYear: null }).reason).toContain('없음')
    expect(resolveMember(MEMBERS, { name: '가짜하나', cohort: 3, studentYear: null }).reason).toContain('3기가 아님')
  })
})

describe('엑셀 읽기', () => {
  it('인턴 명단의 "25 하반기"를 학번으로 읽지 않고, 병합된 학번은 아래 줄에도 적용한다', async () => {
    const data = await readWorkbook(await makeFile())
    const byName = (n: string) => data.current.filter((r: { name: string }) => r.name === n)
    expect(byName('가짜하나').map((r: { studentYear: number | null }) => r.studentYear)).toEqual([21, 21, null])
    expect(byName('가짜셋')[0].studentYear).toBe(20) // 병합 셀
  })

  it('경력·이메일·번호를 읽는다 (개인 메일과 직장 메일을 도메인으로 나눈다)', async () => {
    const result = buildImport(await readWorkbook(await makeFile()), MEMBERS)
    const p = (n: string) => result.people.find((x: { member: Member }) => x.member.name === n)
    expect(p('가짜하나').personalEmail).toBe('real1@naver.com')
    expect(p('가짜둘').workEmail).toBe('work2@fakebank.co.kr')
    expect(p('가짜회장').phone).toBe('010-1234-5678')
    expect(p('가짜셋').phone).toBe('010-2222-3333')
  })

  it('이력의 현직 줄은 현직 시트의 같은 회사 줄과 합쳐지고 시작일·직위를 채운다', async () => {
    const result = buildImport(await readWorkbook(await makeFile()), MEMBERS)
    const careers = result.people.find((x: { member: Member }) => x.member.name === '가짜하나').careers
    const current = careers.filter((c: { isCurrent: boolean }) => c.isCurrent)
    expect(current).toHaveLength(1)
    expect(current[0]).toMatchObject({ company: '가짜증권', title: 'Associate', startedOn: '2021-10-01', team: '리서치센터' })
    expect(careers.map((c: { company: string }) => c.company).sort()).toEqual(['가짜운용', '가짜은행', '가짜증권', '옛날증권'])
    expect(careers.find((c: { company: string }) => c.company === '옛날증권')).toMatchObject({ isCurrent: false, team: '채권팀' })
  })

  it('이력 시트의 인턴 직위는 인턴 경력이 된다', async () => {
    const result = buildImport(await readWorkbook(await makeFile()), MEMBERS)
    const careers = result.people.find((x: { member: Member }) => x.member.name === '가짜둘').careers
    expect(careers.find((c: { company: string }) => c.company === '가짜운용')).toMatchObject({ kind: '인턴', isCurrent: false, title: '인턴' })
  })

  it('인턴은 직급이 "인턴"이고, 현직이 없으면 가장 최근 인턴을 현직으로 둔다', async () => {
    const result = buildImport(await readWorkbook(await makeFile()), MEMBERS)
    const careers = result.people.find((x: { member: Member }) => x.member.name === '가짜인턴').careers
    expect(careers.map((c: { company: string; isCurrent: boolean; title: string }) => [c.company, c.isCurrent, c.title])).toEqual([
      ['가짜A증권', false, '인턴'],
      ['가짜B운용', true, '인턴'],
    ])
  })

  it('기수가 없는 줄은 이름과 학번으로 맞추고, 명단에 없는 사람은 확인 필요로 남긴다', async () => {
    const result = buildImport(await readWorkbook(await makeFile()), MEMBERS)
    const dup = result.people.find((x: { member: Member }) => x.member.cohort === 12)
    expect(dup.careers.map((c: { company: string }) => c.company)).toEqual(['가짜공사'])
    expect(result.review.some((r: string) => r.includes('명단없음'))).toBe(true)
  })

  it('명단에 학번이 없는 사람은 기수별 명단 시트의 학번으로 채운다', async () => {
    const result = buildImport(await readWorkbook(await makeFile()), MEMBERS)
    const year = (n: string) => result.people.find((x: { member: Member }) => x.member.name === n).studentYear
    expect(year('가짜셋')).toBe(20)
    expect(year('가짜회장')).toBe(22)
    expect(year('가짜하나')).toBeNull() // 명단에 이미 학번이 있는 사람은 건드리지 않는다
  })
})

describe('만든 SQL', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await createDb()
    for (const m of MEMBERS) {
      await db.query(`insert into public.members (name, cohort, student_year) values ($1, $2, $3)`, [m.name, m.cohort, m.studentYear])
    }
  })
  afterEach(async () => {
    await db.close()
  })

  const sql = async () => toSql(buildImport(await readWorkbook(await makeFile()), MEMBERS))
  const count = async (table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n

  it('SQL 편집기에서 실행되고 경력과 연락처가 들어간다', async () => {
    await db.exec(await sql())
    expect(await count('careers')).toBeGreaterThanOrEqual(8)
    const r = await db.query(`select personal_email, phone from public.members where name = '가짜하나' or name = '가짜회장' order by name`)
    expect(r.rows).toEqual([
      { personal_email: 'real1@naver.com', phone: null },
      { personal_email: null, phone: '010-1234-5678' },
    ])
    const intern = await db.query(
      `select kind, is_current, started_on::text, ended_on::text from public.careers c join public.members m on m.id = c.member_id where m.name = '가짜둘' and c.company = '가짜투자'`,
    )
    expect(intern.rows).toEqual([{ kind: '인턴', is_current: false, started_on: '2024-07-01', ended_on: '2024-12-31' }])
  })

  it('여러 번 실행해도 경력이 늘지 않는다', async () => {
    await db.exec(await sql())
    const first = await count('careers')
    await db.exec(await sql())
    expect(await count('careers')).toBe(first)
  })

  it('예전에 현직으로 들어간 회색 글씨 직장을 이전 직장으로 고친다', async () => {
    await db.exec(`insert into public.careers (member_id, kind, is_current, company, team)
      select id, '정규', true, '옛날증권', '채권팀' from public.members where name = '가짜하나'`)
    await db.exec(await sql())
    const r = await db.query(
      `select c.company, c.is_current from public.careers c join public.members m on m.id = c.member_id where m.name = '가짜하나' and c.kind = '정규' order by c.company`,
    )
    expect(r.rows).toEqual([
      { company: '가짜은행', is_current: false },
      { company: '가짜증권', is_current: true },
      { company: '옛날증권', is_current: false },
    ])
  })

  it('이미 있는 연락처는 덮어쓰지 않는다', async () => {
    await db.exec(`update public.members set phone = '010-9999-9999' where name = '가짜회장'`)
    await db.exec(await sql())
    const r = await db.query(`select phone from public.members where name = '가짜회장'`)
    expect(r.rows).toEqual([{ phone: '010-9999-9999' }])
  })

  it('예전에 직급 없이 이전 경력으로 들어간 인턴 줄에 직급과 현직 여부를 맞춘다', async () => {
    await db.exec(`insert into public.careers (member_id, kind, is_current, company, started_on)
      select id, '인턴', false, '가짜B운용', '2025-07-01' from public.members where name = '가짜인턴'`)
    await db.exec(await sql())
    const r = await db.query(
      `select c.company, c.title, c.is_current from public.careers c join public.members m on m.id = c.member_id where m.name = '가짜인턴' order by c.company`,
    )
    expect(r.rows).toEqual([
      { company: '가짜A증권', title: '인턴', is_current: false },
      { company: '가짜B운용', title: '인턴', is_current: true },
    ])
  })
})
