import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createDb } from './harness'
import { M, U, seed } from './fixtures'

let db: PGlite
beforeEach(async () => {
  db = await createDb()
  await seed(db)
})

const rows = (userId: string | null, sql: string) =>
  asUser(db, userId, async () => (await db.query<Record<string, unknown>>(sql)).rows)

describe('수정 기록', () => {
  it('관리자가 고치면 누가 무엇을 바꿨는지 남는다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.members set department = '글로벌경제' where id = '${M.member}'`))
    const r = await rows(U.super, `select actor, action, old_data->>'department' as old_d, new_data->>'department' as new_d
      from public.audit_log where table_name = 'members' and row_id = '${M.member}' and action = 'UPDATE'`)
    expect(r).toEqual([{ actor: U.admin, action: 'UPDATE', old_d: null, new_d: '글로벌경제' }])
  })

  it('추가는 새 값만, 삭제는 옛 값만 남는다', async () => {
    await asUser(db, U.admin, () =>
      db.exec(`insert into public.members (id, name, cohort) values ('10000000-0000-0000-0000-0000000000a1', '테스트추가', 19)`),
    )
    await asUser(db, U.admin, () => db.exec(`delete from public.members where id = '10000000-0000-0000-0000-0000000000a1'`))
    const r = await rows(
      U.super,
      `select action, old_data is null as no_old, new_data is null as no_new, new_data->>'name' as new_name, old_data->>'name' as old_name
       from public.audit_log where row_id = '10000000-0000-0000-0000-0000000000a1' order by id`,
    )
    expect(r).toEqual([
      { action: 'INSERT', no_old: true, no_new: false, new_name: '테스트추가', old_name: null },
      { action: 'DELETE', no_old: false, no_new: true, new_name: null, old_name: '테스트추가' },
    ])
  })

  it('경력 삭제도 기록된다', async () => {
    await asUser(db, U.admin, () => db.exec(`delete from public.careers where member_id = '${M.member}' and kind = '인턴'`))
    const r = await rows(U.super, `select action, old_data->>'company' as company from public.audit_log where table_name = 'careers'`)
    expect(r).toContainEqual({ action: 'DELETE', company: '가짜운용' })
  })

  it('계정 변경은 계정 사용자 번호로 기록된다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.accounts set status = '승인' where user_id = '${U.pending}'`))
    const r = await rows(U.super, `select actor, row_id, old_data->>'status' as old_s, new_data->>'status' as new_s
      from public.audit_log where table_name = 'accounts' and action = 'UPDATE'`)
    expect(r).toEqual([{ actor: U.admin, row_id: U.pending, old_s: '대기', new_s: '승인' }])
  })

  it('관리자는 수정 기록을 볼 수 있다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.members set department = 'x' where id = '${M.member}'`))
    expect((await rows(U.admin, 'select * from public.audit_log')).length).toBeGreaterThan(0)
  })

  it('학회원은 수정 기록을 볼 수 없다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.members set department = 'x' where id = '${M.member}'`))
    expect(await rows(U.member, 'select * from public.audit_log')).toHaveLength(0)
  })

  it('로그인하지 않은 사람은 수정 기록을 읽을 수 없다', async () => {
    await expect(rows(null, 'select * from public.audit_log')).rejects.toThrow(/permission denied/)
  })

  it('학회원은 수정 기록을 직접 쓸 수 없다', async () => {
    await expect(
      asUser(db, U.member, () => db.exec(`insert into public.audit_log (table_name, action) values ('members', 'UPDATE')`)),
    ).rejects.toThrow(/permission denied/)
  })

  it('관리자도 수정 기록을 직접 쓰거나 고치거나 지울 수 없다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.members set department = 'x' where id = '${M.member}'`))
    await expect(
      asUser(db, U.admin, () => db.exec(`insert into public.audit_log (table_name, action) values ('members', 'UPDATE')`)),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(db, U.admin, () => db.exec(`update public.audit_log set action = 'DELETE'`)),
    ).rejects.toThrow(/permission denied/)
    await expect(asUser(db, U.admin, () => db.exec(`delete from public.audit_log`))).rejects.toThrow(/permission denied/)
  })

  it('관리자도 수정 기록을 비울 수 없다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.members set department = 'x' where id = '${M.member}'`))
    const before = (await rows(U.super, 'select count(*)::int as n from public.audit_log'))[0].n
    expect(before).toBeGreaterThan(0)
    await expect(asUser(db, U.admin, () => db.exec('truncate public.audit_log'))).rejects.toThrow(/permission denied/)
    expect((await rows(U.super, 'select count(*)::int as n from public.audit_log'))[0].n).toBe(before)
  })

  it('수정 기록 함수는 직접 부를 수 없다', async () => {
    await expect(asUser(db, U.admin, () => db.exec('select public.write_audit()'))).rejects.toThrow(/permission denied/)
  })

  it('로그인한 사람은 수정 기록 번호표를 건드릴 수 없고 기록은 계속 쓰인다', async () => {
    await expect(
      asUser(db, U.admin, () => db.exec(`select setval('public.audit_log_id_seq', 9000000000000000000)`)),
    ).rejects.toThrow(/permission denied/)
    await expect(asUser(db, U.admin, () => db.exec(`select nextval('public.audit_log_id_seq')`))).rejects.toThrow(/permission denied/)
    await asUser(db, U.admin, () => db.exec(`update public.members set department = 'x' where id = '${M.member}'`))
    const r = await rows(U.super, `select id::int as id from public.audit_log where table_name = 'members' and action = 'UPDATE'`)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBeLessThan(1000)
  })
})
