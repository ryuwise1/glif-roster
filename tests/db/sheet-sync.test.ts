import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createDb } from './harness'
import { M, seed } from './fixtures'

// 모두 가짜 데이터
const KEY = 'test-sheet-key-0123456789abcdef'

let db: PGlite
beforeEach(async () => {
  db = await createDb()
  await seed(db)
  await db.exec(`insert into public.sync_keys (name, key_hash) values ('sheet', encode(sha256(convert_to('${KEY}', 'UTF8')), 'hex'))`)
})
afterEach(async () => {
  await db.close()
})

type Row = Record<string, string | null>
const exportRows = (key = KEY) => asUser(db, null, async () => (await db.query<Row>('select * from public.sheet_export($1)', [key])).rows)
type Result = { rows: { row: number; member_id: string; career_id: string | null }[]; problems: { row: number; message: string }[] }
const apply = (rows: object[], key = KEY) =>
  asUser(db, null, async () => (await db.query<{ r: Result }>('select public.sheet_apply($1, $2::jsonb) as r', [key, JSON.stringify(rows)])).rows[0].r)
const careerId = async (company: string) =>
  (await db.query<{ id: string }>(`select id from public.careers where company = '${company}'`)).rows[0].id
const auditCount = async () => (await db.query<{ n: number }>('select count(*)::int as n from public.audit_log')).rows[0].n

// 시트 한 줄 모양 (빈칸은 '')
const line = (over: object) => ({
  row: 2, member_id: '', career_id: '', cohort: '', name: '', student_year: '',
  company: '', team: '', title: '', job_function: '', phone: '', personal_email: '', status: '', ...over,
})

describe('시트 동기화', () => {
  it('키가 틀리면 내보내지도 반영하지도 않는다', async () => {
    await expect(exportRows('wrong')).rejects.toThrow(/키가 맞지 않습니다/)
    await expect(apply([], 'wrong')).rejects.toThrow(/키가 맞지 않습니다/)
    const drive = 'drive-key-0123456789abcdef'
    await db.exec(`insert into public.sync_keys (name, key_hash) values ('drive', encode(sha256(convert_to('${drive}', 'UTF8')), 'hex'))`)
    await expect(exportRows(drive)).rejects.toThrow(/키가 맞지 않습니다/)
  })

  it('내보내기: 기수 → 회장 → 이름 순, 현직과 이전 정규직만, 경력 없는 사람도 한 줄', async () => {
    await db.exec(`
      update public.members set student_year = 5 where id = '${M.member}';
      insert into public.careers (member_id, kind, is_current, company, ended_on) values
        ('${M.member}', '정규', false, '가짜은행', '2020-01-01'),
        ('${M.member}', '정규', false, '가짜캐피탈', '2023-01-01');
    `)
    const rows = await exportRows()
    expect(rows.map((r) => [r.cohort, r.name, r.company, r.status])).toEqual([
      [18, '테스트개발', null, null],
      [19, '테스트회장', null, null],
      [19, '테스트미가입', null, null],
      [19, '테스트회원', '가짜증권', '현직'],
      [19, '테스트회원', '가짜캐피탈', '이전'],
      [19, '테스트회원', '가짜은행', '이전'],
      [20, '테스트대기', null, null],
    ])
    const me = rows[3]
    expect(me).toMatchObject({ member_id: M.member, student_year: '05', contact: '010-1111-0003', phone: '010-1111-0003' })
    expect(me.career_id).toBe(await careerId('가짜증권'))
  })

  it('반영: 학번·휴대폰·이메일과 경력을 고치고, 구분으로 현직/이전을 바꾼다', async () => {
    const cid = await careerId('가짜증권')
    const r = await apply([line({
      member_id: M.member, career_id: cid, student_year: '07', phone: '01022223333', personal_email: 'fake@example.com',
      company: '가짜증권', team: '가짜팀', title: '대리', job_function: '채권', status: '이전',
    })])
    expect(r).toEqual({ rows: [{ row: 2, member_id: M.member, career_id: cid }], problems: [] })
    const m = (await db.query<Row>(`select student_year, phone, personal_email from public.members where id = '${M.member}'`)).rows[0]
    expect(m).toEqual({ student_year: 7, phone: '010-2222-3333', personal_email: 'fake@example.com' })
    const c = (await db.query<Row>(`select team, title, job_function, is_current from public.careers where id = '${cid}'`)).rows[0]
    expect(c).toEqual({ team: '가짜팀', title: '대리', job_function: '채권', is_current: false })
  })

  it('반영: ID 없이 적은 줄은 기수+성함으로 찾아 정규 경력을 새로 넣고 ID 를 돌려준다', async () => {
    const r = await apply([
      line({ row: 5, cohort: '19', name: '테스트미가입', company: '가짜자산', status: '' }),
      line({ row: 6, member_id: M.dev, company: '가짜연구소', status: '이전' }),
    ])
    expect(r.problems).toEqual([])
    const added = await db.query<Row>(`select member_id, kind, is_current, company from public.careers where company in ('가짜자산', '가짜연구소') order by company`)
    expect(added.rows).toEqual([
      { member_id: M.dev, kind: '정규', is_current: false, company: '가짜연구소' },
      { member_id: M.free, kind: '정규', is_current: true, company: '가짜자산' },
    ])
    expect(r.rows).toEqual([
      { row: 5, member_id: M.free, career_id: await careerId('가짜자산') },
      { row: 6, member_id: M.dev, career_id: await careerId('가짜연구소') },
    ])
  })

  it('틀린 줄은 문제로 알리고 나머지 줄은 반영한다', async () => {
    const cid = await careerId('가짜증권')
    const r = await apply([
      line({ row: 2, member_id: M.member, phone: '02-123-4567' }),
      line({ row: 3, member_id: M.member, career_id: cid, company: '' }),
      line({ row: 4, member_id: M.member, career_id: cid, company: '가짜증권', job_function: '없는직무' }),
      line({ row: 5, member_id: M.admin, career_id: cid, company: '가짜증권' }),
      line({ row: 6, cohort: '19', name: '없는사람', company: '가짜회사' }),
      line({ row: 7, member_id: 'not-a-uuid' }),
      line({ row: 8, cohort: '19', name: '없는사람' }),
      line({ row: 9, member_id: M.dev, student_year: '05', company: '가짜연구소', status: '퇴사' }),
      line({ row: 10, member_id: M.admin, student_year: '11' }),
    ])
    expect(r.problems.map((p) => p.row)).toEqual([2, 3, 4, 5, 6, 7, 9])
    expect(r.problems[0].message).toMatch(/010-0000-0000/)
    expect(r.problems[2].message).toMatch(/목록에 없습니다/)
    expect(r.rows).toEqual([{ row: 10, member_id: M.admin, career_id: null }])
    const years = await db.query<Row>(`select id, student_year from public.members where id in ('${M.admin}', '${M.dev}') order by id`)
    // 9번 줄은 구분이 틀려 학번까지 통째로 빠진다
    expect(years.rows).toEqual([{ id: M.dev, student_year: null }, { id: M.admin, student_year: 11 }])
    expect((await db.query(`select 1 from public.careers where company in ('가짜회사', '가짜연구소')`)).rows).toEqual([])
  })

  it('값이 같으면 고치지 않아 수정 기록이 늘지 않는다', async () => {
    const cid = await careerId('가짜증권')
    const same = line({ member_id: M.member, career_id: cid, phone: '010-1111-0003', company: '가짜증권', status: '현직' })
    const before = await auditCount()
    expect((await apply([same])).problems).toEqual([])
    expect(await auditCount()).toBe(before)
  })

  it('숨긴 연락처는 비공개로 내보내고, 비공개를 받으면 그대로 둔다', async () => {
    const boss = (await exportRows()).find((r) => r.member_id === M.admin)
    expect(boss).toMatchObject({ phone: '비공개', contact: null, personal_email: null })
    expect((await apply([line({ member_id: M.admin, phone: '비공개' })])).problems).toEqual([])
    const m = (await db.query<Row>(`select phone from public.members where id = '${M.admin}'`)).rows[0]
    expect(m.phone).toBe('010-1111-0002')
  })

  it('ID 없이 새로 적은 줄의 빈칸은 학번·휴대폰·이메일을 지우지 않는다', async () => {
    await db.exec(`update public.members set student_year = 5, personal_email = 'old@example.com' where id = '${M.member}'`)
    const r = await apply([line({ cohort: '19', name: '테스트회원', company: '가짜보험', personal_email: 'new@example.com' })])
    expect(r.problems).toEqual([])
    const m = (await db.query<Row>(`select student_year, phone, personal_email from public.members where id = '${M.member}'`)).rows[0]
    expect(m).toEqual({ student_year: 5, phone: '010-1111-0003', personal_email: 'new@example.com' })
  })

  it('이름·기수는 시트에서 바꾸지 않는다', async () => {
    await apply([line({ member_id: M.member, cohort: '3', name: '바뀐이름', phone: '010-1111-0003' })])
    const m = (await db.query<Row>(`select name, cohort from public.members where id = '${M.member}'`)).rows[0]
    expect(m).toEqual({ name: '테스트회원', cohort: 19 })
  })
})
