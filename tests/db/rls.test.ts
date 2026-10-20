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
    await expect(rows(null, 'select * from public.member_directory')).rejects.toThrow(/permission denied/)
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

  it('숨긴 개인·회사 이메일도 다른 학회원에게는 가려지고 본인과 관리자에게는 보인다', async () => {
    await db.exec(`update public.members set personal_email = 'a@example.com', work_email = 'b@example.com',
      hidden_fields = '{personal_email,work_email}' where id in ('${M.admin}', '${M.member}')`)
    const q = (id: string) =>
      `select personal_email, work_email from public.member_directory where id = '${id}'`
    expect(await rows(U.member, q(M.admin))).toEqual([{ personal_email: null, work_email: null }])
    expect(await rows(U.admin, q(M.admin))).toEqual([{ personal_email: 'a@example.com', work_email: 'b@example.com' }])
    expect(await rows(U.member, q(M.member))).toEqual([{ personal_email: 'a@example.com', work_email: 'b@example.com' }])
    expect(await rows(U.super, q(M.admin))).toEqual([{ personal_email: 'a@example.com', work_email: 'b@example.com' }])
  })

  it('로그인하지 않은 사람은 members와 accounts를 직접 읽을 수 없다', async () => {
    await expect(rows(null, 'select * from public.members')).rejects.toThrow(/permission denied/)
    await expect(rows(null, 'select * from public.accounts')).rejects.toThrow(/permission denied/)
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

  it('연명부 뷰로는 수정·삭제·추가할 수 없고 members 표는 그대로다', async () => {
    const before = await rows(U.super, 'select id, department, name from public.members order by id')
    await expect(
      asUser(db, U.member, () => db.exec(`update public.member_directory set department = '변조' where id = '${M.admin}'`)),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(db, U.member, () => db.exec(`delete from public.member_directory where id = '${M.admin}'`)),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(db, U.member, () => db.exec(`insert into public.member_directory (name, cohort) values ('가짜', 19)`)),
    ).rejects.toThrow(/permission denied/)
    expect(await rows(U.super, 'select id, department, name from public.members order by id')).toEqual(before)
  })

  it('관리자는 연결되지 않은 학회원을 삭제할 수 있다', async () => {
    await asUser(db, U.admin, () => db.exec(`delete from public.members where id = '${M.free}'`))
    expect(await rows(U.super, `select id from public.members where id = '${M.free}'`)).toHaveLength(0)
  })

  it('학회원은 학회원을 삭제할 수 없다 (RLS가 막고 삭제 차단 트리거는 작동하지 않는다)', async () => {
    await asUser(db, U.member, () => db.exec(`delete from public.members where id = '${M.free}'`))
    await asUser(db, U.member, () => db.exec(`delete from public.members where id = '${M.member}'`))
    expect(
      await rows(U.super, `select id from public.members where id in ('${M.free}', '${M.member}')`),
    ).toHaveLength(2)
  })

  it('학회원은 경력을 추가할 수 없다', async () => {
    await expect(
      asUser(db, U.member, () => db.exec(`insert into public.careers (member_id, company) values ('${M.member}', '가짜')`)),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('가입 신청과 승인', () => {
  it('가입 후보에는 해당 기수에서 아직 연결되지 않은 사람만 나온다', async () => {
    const r = await rows(U.stranger, 'select * from public.signup_candidates(19)')
    expect(r.map((x) => x.id)).toEqual([M.free])
  })

  it('로그인하지 않으면 가입 후보를 볼 수 없다', async () => {
    await expect(rows(null, 'select * from public.signup_candidates(19)')).rejects.toThrow(/permission denied/)
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
    ).rejects.toThrow(/row-level security/)
    await expect(
      asUser(db, U.stranger, () =>
        db.exec(`insert into public.accounts (user_id, member_id, role) values ('${U.stranger}', '${M.free}', '관리자')`),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('남의 계정으로 신청할 수 없다', async () => {
    await expect(
      asUser(db, U.stranger, () =>
        db.exec(`insert into public.accounts (user_id, member_id) values ('${U.pending}', '${M.free}')`),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('가입 신청 때 결정 기록을 미리 채워도 비워진다', async () => {
    await asUser(db, U.stranger, () =>
      db.exec(`insert into public.accounts (user_id, member_id, decided_by, decided_at, reject_reason)
        values ('${U.stranger}', '${M.free}', '${U.super}', now(), '사전 입력')`),
    )
    const [r] = await rows(U.super, `select decided_by, decided_at, reject_reason from public.accounts where user_id = '${U.stranger}'`)
    expect(r).toEqual({ decided_by: null, decided_at: null, reject_reason: null })
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

  it('관리자는 최고관리자 계정을 삭제할 수 없다', async () => {
    await expect(
      asUser(db, U.admin, () => db.exec(`delete from public.accounts where user_id = '${U.super}'`)),
    ).rejects.toThrow(/최고 관리자/)
    expect(await rows(U.super, `select user_id from public.accounts where user_id = '${U.super}'`)).toHaveLength(1)
  })

  it('최고관리자는 다른 계정을 삭제할 수 있다', async () => {
    await asUser(db, U.super, () => db.exec(`delete from public.accounts where user_id = '${U.member}'`))
    expect(await rows(U.super, `select user_id from public.accounts where user_id = '${U.member}'`)).toHaveLength(0)
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

describe('표 비우기 권한', () => {
  // TRUNCATE 는 RLS 와 행 트리거(수정 기록)를 건너뛰므로 로그인한 사람에게 주지 않는다
  it.each(['members', 'careers', 'accounts'])('관리자도 %s 표를 비울 수 없다', async (table) => {
    const count = async () => (await rows(U.super, `select count(*)::int as n from public.${table}`))[0].n
    const before = await count()
    await expect(asUser(db, U.admin, () => db.exec(`truncate public.${table}`))).rejects.toThrow(/permission denied/)
    expect(await count()).toBe(before)
  })

  it('로그인한 사람에게는 어떤 표의 TRUNCATE·REFERENCES·TRIGGER 권한도 없다', async () => {
    const tables = ['settings', 'industries', 'job_functions', 'members', 'careers', 'accounts', 'audit_log']
    for (const t of tables) {
      for (const priv of ['TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const { rows: [r] } = await db.query<{ ok: boolean }>(
          `select has_table_privilege('authenticated', 'public.${t}', '${priv}') as ok`,
        )
        expect([t, priv, r.ok]).toEqual([t, priv, false])
      }
    }
  })

  it('로그인한 사람은 어떤 시퀀스도 바꾸거나 읽을 수 없다', async () => {
    const { rows } = await db.query<{ name: string; ok: boolean }>(
      `select c.relname as name,
              has_sequence_privilege('authenticated', c.oid, 'UPDATE') or has_sequence_privilege('authenticated', c.oid, 'SELECT') as ok
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'S' and n.nspname = 'public'`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((r) => r.ok)).toEqual([])
  })
})
