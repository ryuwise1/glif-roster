import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createDb } from './harness'
import { M, U, seed } from './fixtures'

// 모두 가짜 데이터
let db: PGlite
beforeEach(async () => {
  db = await createDb()
  await seed(db)
})
afterEach(async () => {
  await db.close()
})

const rows = (userId: string | null, sql: string) =>
  asUser(db, userId, async () => (await db.query<Record<string, unknown>>(sql)).rows)

describe('내 정보 수정', () => {
  it('승인된 학회원은 자기 연락처·학과·학번·숨김 항목을 고칠 수 있고 수정자가 남는다', async () => {
    await asUser(db, U.member, () =>
      db.exec(`update public.members set phone = '010-2222-0003', department = '가짜학과', student_year = 21, hidden_fields = '{phone}'
               where id = '${M.member}'`),
    )
    const [r] = await rows(U.super, `select phone, department, student_year, hidden_fields, updated_by from public.members where id = '${M.member}'`)
    expect(r).toEqual({ phone: '010-2222-0003', department: '가짜학과', student_year: 21, hidden_fields: ['phone'], updated_by: U.member })
  })

  it('본인이라도 이름·기수·기수 역할은 고칠 수 없다', async () => {
    for (const set of [`name = '바꾼이름'`, 'cohort = 18', `cohort_role = '회장'`]) {
      await expect(
        asUser(db, U.member, () => db.exec(`update public.members set ${set} where id = '${M.member}'`)),
      ).rejects.toThrow(/관리자만 고칠 수 있습니다/)
    }
    const [r] = await rows(U.super, `select name, cohort, cohort_role from public.members where id = '${M.member}'`)
    expect(r).toEqual({ name: '테스트회원', cohort: 19, cohort_role: null })
  })

  it('관리자는 이름·기수·기수 역할을 고칠 수 있다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.members set name = '고친회원', cohort_role = '부회장' where id = '${M.member}'`))
    const [r] = await rows(U.super, `select name, cohort_role from public.members where id = '${M.member}'`)
    expect(r).toEqual({ name: '고친회원', cohort_role: '부회장' })
  })

  it('승인 대기 계정은 자기 정보를 고칠 수 없다', async () => {
    await asUser(db, U.pending, () => db.exec(`update public.members set department = '변조' where id = '${M.pending}'`))
    const [r] = await rows(U.super, `select department from public.members where id = '${M.pending}'`)
    expect(r.department).toBeNull()
  })
})

describe('내 경력 수정', () => {
  it('승인된 학회원은 자기 경력을 추가·수정·삭제할 수 있다', async () => {
    await asUser(db, U.member, async () => {
      await db.exec(`insert into public.careers (member_id, company) values ('${M.member}', '가짜은행')`)
      await db.exec(`update public.careers set title = '대리' where member_id = '${M.member}' and company = '가짜증권'`)
      await db.exec(`delete from public.careers where member_id = '${M.member}' and company = '가짜운용'`)
    })
    expect(await rows(U.super, `select company, title from public.careers where member_id = '${M.member}' order by company`)).toEqual([
      { company: '가짜은행', title: null },
      { company: '가짜증권', title: '대리' },
    ])
  })

  it('다른 사람에게 경력을 넣거나 내 경력을 다른 사람에게 옮길 수 없다', async () => {
    await expect(
      asUser(db, U.member, () => db.exec(`insert into public.careers (member_id, company) values ('${M.free}', '가짜')`)),
    ).rejects.toThrow(/row-level security/)
    await expect(
      asUser(db, U.member, () => db.exec(`update public.careers set member_id = '${M.free}' where member_id = '${M.member}'`)),
    ).rejects.toThrow(/row-level security/)
    expect(await rows(U.super, `select id from public.careers where member_id = '${M.free}'`)).toHaveLength(0)
  })

  it('승인 대기 계정은 경력을 넣을 수 없다', async () => {
    await expect(
      asUser(db, U.pending, () => db.exec(`insert into public.careers (member_id, company) values ('${M.pending}', '가짜')`)),
    ).rejects.toThrow(/row-level security/)
  })

  it('본인이 고친 경력도 수정 기록에 남는다', async () => {
    await asUser(db, U.member, () => db.exec(`update public.careers set title = '과장' where member_id = '${M.member}' and company = '가짜증권'`))
    const log = await rows(U.super, `select table_name, actor from public.audit_log where table_name = 'careers' and action = 'UPDATE'`)
    expect(log).toEqual([{ table_name: 'careers', actor: U.member }])
  })
})
