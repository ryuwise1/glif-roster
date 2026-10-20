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

describe('열람 권한', () => {
  it('로그인하지 않은 사람은 연명부 뷰에 접근할 수 없다', async () => {
    await expect(rows(null, 'select * from public.member_directory')).rejects.toThrow()
  })

  it('신청하지 않은 사람과 승인 대기자는 아무것도 볼 수 없다', async () => {
    expect(await rows(U.stranger, 'select * from public.member_directory')).toHaveLength(0)
    expect(await rows(U.pending, 'select * from public.member_directory')).toHaveLength(0)
    expect(await rows(U.pending, 'select * from public.careers')).toHaveLength(0)
  })

  it('승인된 학회원은 전체 명단과 경력을 본다', async () => {
    expect(await rows(U.member, 'select * from public.member_directory')).toHaveLength(5)
    expect(await rows(U.member, 'select * from public.careers')).toHaveLength(2)
  })

  it('숨긴 연락처는 다른 학회원에게 가려진다', async () => {
    const [r] = await rows(U.member, `select phone from public.member_directory where id = '${M.admin}'`)
    expect(r.phone).toBeNull()
  })

  it('숨긴 연락처도 본인과 관리자에게는 보인다', async () => {
    const [own] = await rows(U.admin, `select phone from public.member_directory where id = '${M.admin}'`)
    expect(own.phone).toBe('010-1111-0002')
    const [bySuper] = await rows(U.super, `select phone from public.member_directory where id = '${M.admin}'`)
    expect(bySuper.phone).toBe('010-1111-0002')
  })

  it('학회원은 members 표에서 자기 행만 직접 읽는다', async () => {
    const r = await rows(U.member, 'select id from public.members')
    expect(r.map((x) => x.id)).toEqual([M.member])
  })
})

describe('수정 권한', () => {
  it('학회원은 다른 사람 정보를 고칠 수 없다', async () => {
    await asUser(db, U.member, () => db.exec(`update public.members set department = '변조' where id = '${M.admin}'`))
    const [r] = await rows(U.super, `select department from public.members where id = '${M.admin}'`)
    expect(r.department).toBeNull()
  })

  it('관리자는 학회원 정보와 경력을 고칠 수 있다', async () => {
    await asUser(db, U.admin, async () => {
      await db.exec(`update public.members set department = '글로벌경영' where id = '${M.member}'`)
      await db.exec(`insert into public.careers (member_id, company) values ('${M.free}', '가짜은행')`)
    })
    const [r] = await rows(U.super, `select department from public.members where id = '${M.member}'`)
    expect(r.department).toBe('글로벌경영')
    expect(await rows(U.super, `select * from public.careers where member_id = '${M.free}'`)).toHaveLength(1)
  })

  it('학회원은 경력을 추가할 수 없다', async () => {
    await expect(
      asUser(db, U.member, () => db.exec(`insert into public.careers (member_id, company) values ('${M.member}', '가짜')`)),
    ).rejects.toThrow()
  })
})

describe('가입 신청과 승인', () => {
  it('가입 후보에는 해당 기수에서 아직 연결되지 않은 사람만 나온다', async () => {
    const r = await rows(U.stranger, 'select * from public.signup_candidates(19)')
    expect(r.map((x) => x.id)).toEqual([M.free])
  })

  it('로그인하지 않으면 가입 후보를 볼 수 없다', async () => {
    await expect(rows(null, 'select * from public.signup_candidates(19)')).rejects.toThrow()
  })

  it('본인 계정으로 대기 상태 신청은 할 수 있다', async () => {
    await asUser(db, U.stranger, () =>
      db.exec(`insert into public.accounts (user_id, member_id) values ('${U.stranger}', '${M.free}')`),
    )
    const r = await rows(U.stranger, 'select status from public.accounts')
    expect(r).toEqual([{ status: '대기' }])
  })

  it('스스로 승인 상태나 관리자 역할로 신청할 수 없다', async () => {
    await expect(
      asUser(db, U.stranger, () =>
        db.exec(`insert into public.accounts (user_id, member_id, status) values ('${U.stranger}', '${M.free}', '승인')`),
      ),
    ).rejects.toThrow()
    await expect(
      asUser(db, U.stranger, () =>
        db.exec(`insert into public.accounts (user_id, member_id, role) values ('${U.stranger}', '${M.free}', '관리자')`),
      ),
    ).rejects.toThrow()
  })

  it('남의 계정으로 신청할 수 없다', async () => {
    await expect(
      asUser(db, U.stranger, () =>
        db.exec(`insert into public.accounts (user_id, member_id) values ('${U.pending}', '${M.free}')`),
      ),
    ).rejects.toThrow()
  })

  it('대기자는 자기 신청 상태를 바꿀 수 없다', async () => {
    await asUser(db, U.pending, () => db.exec(`update public.accounts set status = '승인' where user_id = '${U.pending}'`))
    const [r] = await rows(U.super, `select status from public.accounts where user_id = '${U.pending}'`)
    expect(r.status).toBe('대기')
  })

  it('관리자가 승인하면 결정 시각과 결정자가 기록된다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.accounts set status = '승인' where user_id = '${U.pending}'`))
    const [r] = await rows(U.super, `select status, decided_by, decided_at from public.accounts where user_id = '${U.pending}'`)
    expect(r.status).toBe('승인')
    expect(r.decided_by).toBe(U.admin)
    expect(r.decided_at).not.toBeNull()
  })
})

describe('관리자 권한 넘기기', () => {
  it('관리자는 학회원을 관리자로 지정할 수 있다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.accounts set role = '관리자' where user_id = '${U.member}'`))
    const [r] = await rows(U.super, `select role from public.accounts where user_id = '${U.member}'`)
    expect(r.role).toBe('관리자')
  })

  it('관리자는 최고관리자를 지정할 수 없다', async () => {
    await expect(
      asUser(db, U.admin, () => db.exec(`update public.accounts set role = '최고관리자' where user_id = '${U.member}'`)),
    ).rejects.toThrow(/최고 관리자/)
  })

  it('관리자는 최고관리자 계정을 건드릴 수 없다', async () => {
    await expect(
      asUser(db, U.admin, () => db.exec(`update public.accounts set status = '거절' where user_id = '${U.super}'`)),
    ).rejects.toThrow(/최고 관리자/)
  })

  it('최고관리자는 최고관리자를 지정할 수 있다', async () => {
    await asUser(db, U.super, () => db.exec(`update public.accounts set role = '최고관리자' where user_id = '${U.admin}'`))
    const [r] = await rows(U.super, `select role from public.accounts where user_id = '${U.admin}'`)
    expect(r.role).toBe('최고관리자')
  })
})

describe('설정과 목록', () => {
  it('학회원은 설정을 읽지만 바꿀 수 없다', async () => {
    expect(await rows(U.member, 'select * from public.settings')).toHaveLength(1)
    await asUser(db, U.member, () => db.exec('update public.settings set self_edit_enabled = true'))
    const [r] = await rows(U.super, 'select self_edit_enabled from public.settings')
    expect(r.self_edit_enabled).toBe(false)
  })

  it('관리자는 업종을 추가할 수 있다', async () => {
    await asUser(db, U.admin, () => db.exec(`insert into public.industries (name) values ('에너지')`))
    expect(await rows(U.member, `select * from public.industries where name = '에너지'`)).toHaveLength(1)
  })
})
