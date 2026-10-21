import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { createDb } from './db/harness'
import { groupPeople, parseExtraMembers, readNetworkSheet, toSql } from '../scripts/import/sheet-sync.mjs'

// 모두 가짜 데이터
async function makeSheet(opts: { tab?: string; header?: string[]; rows?: (string | number | null)[][] } = {}): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(opts.tab ?? '연명부')
  ws.addRow(opts.header ?? ['학번', '기수', '성함', '직장명', '부서명', '연락처'])
  for (const r of opts.rows ?? [
    ['21', 19, '가짜하나', '가짜증권', '리서치팀', 'real1@naver.com'],
    ['21', 19, '가짜하나', '가짜운용', '', 'real1@naver.com'],
    ['22', 20, '가짜신입', '', '', ''],
    ['', '12', '동명이', '가짜은행', '영업부', '010-1234-5678'],
    ['10', '비학회원', '외부인', '가짜컨설팅', '전략팀', 'out@fake.co.kr'],
    ['', 3, '가짜회사원', '가짜전자', '기획팀', 'work@fakecorp.co.kr'],
  ]) ws.addRow(r)
  const path = join(mkdtempSync(join(tmpdir(), 'glif-sheet-')), 'network.xlsx')
  await wb.xlsx.writeFile(path)
  return path
}

describe('시트 읽기', () => {
  it('줄을 읽고 비학회원을 구분한다', async () => {
    const { rows, problems } = await readNetworkSheet(await makeSheet())
    expect(problems).toEqual([])
    expect(rows).toHaveLength(6)
    expect(rows.filter((r: { outsider: boolean }) => r.outsider).map((r: { name: string }) => r.name)).toEqual(['외부인'])
    expect(rows[0]).toMatchObject({ cohort: 19, name: '가짜하나', studentYear: 21, company: '가짜증권' })
  })

  it('탭 이름이나 헤더가 다르면 이유를 알려 주며 멈춘다', async () => {
    await expect(readNetworkSheet(await makeSheet({ tab: 'GLIF 연명부' }))).rejects.toThrow("'연명부' 탭을 찾지 못했습니다")
    await expect(readNetworkSheet(await makeSheet({ header: ['기수', '학번', '성함', '직장명', '부서명', '연락처'] }))).rejects.toThrow('1행(A1~F1)')
  })

  it('기수를 읽지 못한 줄은 문제로 남긴다', async () => {
    const { rows, problems } = await readNetworkSheet(await makeSheet({ rows: [['21', '미정', '가짜하나', '', '', '']] }))
    expect(rows).toEqual([])
    expect(problems[0]).toContain('기수를 읽지 못함')
  })
})

describe('사람별로 모으기', () => {
  it('겸직은 한 사람에 직장 둘이고, 연락처는 번호·개인 메일·직장 메일로 나뉜다', async () => {
    const { rows } = await readNetworkSheet(await makeSheet())
    const people = groupPeople(rows)
    expect(people).toHaveLength(4) // 비학회원은 빠진다
    const by = (n: string) => people.find((p: { name: string }) => p.name === n)
    expect(by('가짜하나').jobs).toHaveLength(2)
    expect(by('가짜하나').personalEmail).toBe('real1@naver.com')
    expect(by('동명이').phone).toBe('010-1234-5678')
    expect(by('가짜회사원').workEmail).toBe('work@fakecorp.co.kr')
  })

  it('추가 학회원 파일의 학과를 채운다', async () => {
    const { rows } = await readNetworkSheet(await makeSheet())
    const people = groupPeople(rows, parseExtraMembers('20 글로벌경영 22 가짜신입'))
    expect(people.find((p: { name: string }) => p.name === '가짜신입')).toMatchObject({ department: '글로벌경영', studentYear: 22 })
  })
})

describe('만든 SQL', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await createDb()
    await db.exec(`insert into public.members (name, cohort, student_year, phone) values ('가짜하나', 19, null, '010-9999-9999')`)
    await db.exec(`insert into public.careers (member_id, kind, is_current, company) select id, '정규', true, '가짜증권' from public.members where name = '가짜하나'`)
  })
  afterEach(async () => {
    await db.close()
  })

  const sql = async () => {
    const { rows } = await readNetworkSheet(await makeSheet())
    return toSql(groupPeople(rows, parseExtraMembers('20 글로벌경영 22 가짜신입')))
  }
  const count = async (table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n

  it('없는 학회원만 추가하고 비학회원은 넣지 않는다', async () => {
    await db.exec(await sql())
    const names = (await db.query<{ name: string }>(`select name from public.members order by name`)).rows.map((r) => r.name)
    expect(names).toEqual(['가짜신입', '가짜하나', '가짜회사원', '동명이'])
  })

  it('이미 있는 사람은 비어 있는 칸만 채우고, 같은 회사 경력은 다시 넣지 않는다', async () => {
    await db.exec(await sql())
    const [m] = (await db.query(`select student_year, phone, personal_email from public.members where name = '가짜하나'`)).rows
    expect(m).toEqual({ student_year: 21, phone: '010-9999-9999', personal_email: 'real1@naver.com' }) // 번호는 덮어쓰지 않음
    const companies = (await db.query<{ company: string }>(`select c.company from public.careers c join public.members m on m.id = c.member_id where m.name = '가짜하나' order by 1`)).rows.map((r) => r.company)
    expect(companies).toEqual(['가짜운용', '가짜증권']) // 가짜증권은 이미 있어서 가짜운용만 추가
  })

  it('여러 번 실행해도 늘지 않는다', async () => {
    await db.exec(await sql())
    const first = [await count('members'), await count('careers')]
    await db.exec(await sql())
    expect([await count('members'), await count('careers')]).toEqual(first)
  })
})
