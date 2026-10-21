import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createDb } from './harness'
import { M, U, seed } from './fixtures'

// 모두 가짜 데이터
const KEY = 'test-sync-key-0123456789abcdef'
const NEW = '00000000-0000-0000-0000-0000000000a1'
const NEW2 = '00000000-0000-0000-0000-0000000000a2'

let db: PGlite
beforeEach(async () => {
  db = await createDb()
  await seed(db)
  await db.exec(`
    insert into public.sync_keys (name, key_hash) values ('drive', encode(sha256(convert_to('${KEY}', 'UTF8')), 'hex'));
    insert into auth.users (id, email, email_confirmed_at) values
      ('${NEW}', 'Shared.One@Gmail.com', now()),
      ('${NEW2}', 'unconfirmed@gmail.com', null);
  `)
})
afterEach(async () => {
  await db.close()
})

const sync = (userId: string | null, key: string, emails: string[]) =>
  asUser(db, userId, async () =>
    (await db.query<{ emails: number; approved: number }>('select * from public.sync_drive_access($1, $2)', [key, emails])).rows[0],
  )
const signup = (userId: string, row: string) =>
  asUser(db, userId, () => db.exec(`insert into public.accounts (user_id, ${row})`))
const account = async (userId: string) =>
  (await db.query<{ status: string; auto_approved: boolean }>(`select status, auto_approved from public.accounts where user_id = '${userId}'`)).rows[0]

describe('드라이브 명단 동기화', () => {
  it('키가 맞으면 명단을 소문자로 맞춰 통째로 바꾼다', async () => {
    expect(await sync(null, KEY, [' A@x.com ', 'a@x.com', 'b@x.com', '', 'not-email'])).toEqual({ emails: 2, approved: 0 })
    expect(await sync(null, KEY, ['b@x.com', 'c@x.com'])).toEqual({ emails: 2, approved: 0 })
    const { rows } = await db.query<{ email: string }>('select email from public.drive_access order by email')
    expect(rows.map((r) => r.email)).toEqual(['b@x.com', 'c@x.com'])
  })

  it('키가 틀리거나 명단이 비면 아무것도 바꾸지 않는다', async () => {
    await sync(null, KEY, ['a@x.com'])
    await expect(sync(null, 'wrong', ['b@x.com'])).rejects.toThrow(/키가 맞지 않습니다/)
    await expect(sync(null, KEY, [])).rejects.toThrow(/빈 명단/)
    const { rows } = await db.query<{ email: string }>('select email from public.drive_access')
    expect(rows.map((r) => r.email)).toEqual(['a@x.com'])
  })

  it('명단과 키는 앱 사용자가 직접 읽거나 고칠 수 없고, 관리자는 명단만 본다', async () => {
    await sync(null, KEY, ['a@x.com'])
    await expect(asUser(db, U.member, () => db.query('select * from public.sync_keys'))).rejects.toThrow(/permission denied/)
    expect((await asUser(db, U.member, () => db.query('select * from public.drive_access'))).rows).toHaveLength(0)
    await expect(asUser(db, U.admin, () => db.exec(`insert into public.drive_access (email) values ('z@x.com')`))).rejects.toThrow(/permission denied/)
    expect((await asUser(db, U.admin, () => db.query('select * from public.drive_access'))).rows).toHaveLength(1)
  })
})

describe('드라이브 명단으로 자동 승인', () => {
  it('명단에 있는 이메일로 본인을 골라 신청하면 바로 승인된다', async () => {
    await sync(null, KEY, ['shared.one@gmail.com'])
    await signup(NEW, `member_id) values ('${NEW}', '${M.free}'`)
    expect(await account(NEW)).toEqual({ status: '승인', auto_approved: true })
  })

  it('명단에 없으면 지금처럼 대기로 남는다', async () => {
    await sync(null, KEY, ['other@gmail.com'])
    await signup(NEW, `member_id) values ('${NEW}', '${M.free}'`)
    expect(await account(NEW)).toEqual({ status: '대기', auto_approved: false })
  })

  it('"목록에 없음"으로 신청하면 명단에 있어도 대기로 남는다', async () => {
    await sync(null, KEY, ['shared.one@gmail.com'])
    await signup(NEW, `claimed_name, claimed_cohort) values ('${NEW}', '가짜새사람', 19`)
    expect(await account(NEW)).toEqual({ status: '대기', auto_approved: false })
  })

  it('확인되지 않은 이메일은 명단에 있어도 대기로 남는다', async () => {
    await sync(null, KEY, ['unconfirmed@gmail.com'])
    await signup(NEW2, `member_id) values ('${NEW2}', '${M.free}'`)
    expect(await account(NEW2)).toEqual({ status: '대기', auto_approved: false })
  })

  it('먼저 신청해 둔 대기자는 명단에 들어오는 동기화 때 승인된다', async () => {
    await signup(NEW, `member_id) values ('${NEW}', '${M.free}'`)
    expect(await account(NEW)).toEqual({ status: '대기', auto_approved: false })
    expect(await sync(null, KEY, ['shared.one@gmail.com'])).toEqual({ emails: 1, approved: 1 })
    expect(await account(NEW)).toEqual({ status: '승인', auto_approved: true })
  })

  it('드라이브에서 빠져도 이미 승인된 계정은 그대로 둔다', async () => {
    await sync(null, KEY, ['shared.one@gmail.com'])
    await signup(NEW, `member_id) values ('${NEW}', '${M.free}'`)
    await sync(null, KEY, ['other@gmail.com'])
    expect(await account(NEW)).toEqual({ status: '승인', auto_approved: true })
  })

  it('신청자가 자동 승인 표시를 꾸며 넣을 수 없다', async () => {
    await signup(NEW, `member_id, auto_approved) values ('${NEW}', '${M.free}', true`)
    expect(await account(NEW)).toEqual({ status: '대기', auto_approved: false })
  })

  it('관리자 역할로 신청한 것처럼 꾸민 신청은 여전히 막힌다', async () => {
    await sync(null, KEY, ['shared.one@gmail.com'])
    await expect(signup(NEW, `member_id, role) values ('${NEW}', '${M.free}', '관리자'`)).rejects.toThrow()
  })
})
