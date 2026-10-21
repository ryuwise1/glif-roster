import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createDb } from './harness'
import { M, U, seed } from './fixtures'

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

describe('열람 권한', () => {
  it('로그인하지 않은 사람은 연명부 뷰에 접근할 수 없다', async () => {
    await expect(rows(null, 'select * from public.member_directory')).rejects.toThrow(/permission denied/)
  })

  it('신청하지 않은 사람과 승인 대기자는 아무것도 볼 수 없다', async () => {
    expect(await rows(U.stranger, 'select * from public.member_directory')).toHaveLength(0)
    expect(await rows(U.pending, 'select * from public.member_directory')).toHaveLength(0)
    expect(await rows(U.pending, 'select * from public.careers')).toHaveLength(0)
  })

  it('승인이 거절된 사람은 연명부·경력·설정을 볼 수 없다', async () => {
    await db.exec(`insert into public.accounts (user_id, member_id, status) values ('${U.stranger}', '${M.free}', '거절')`)
    expect(await rows(U.stranger, 'select * from public.member_directory')).toHaveLength(0)
    expect(await rows(U.stranger, 'select * from public.careers')).toHaveLength(0)
    expect(await rows(U.stranger, 'select * from public.settings')).toHaveLength(0)
  })

  it('로그인하지 않은 사람은 경력·설정·업종을 직접 읽을 수 없다', async () => {
    for (const t of ['careers', 'settings', 'industries']) {
      await expect(rows(null, `select * from public.${t}`)).rejects.toThrow(/permission denied/)
    }
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

  it('학회원은 학회원을 추가할 수 없다', async () => {
    const before = await rows(U.super, 'select id from public.members order by id')
    await expect(
      asUser(db, U.member, () => db.exec(`insert into public.members (name, cohort) values ('가짜추가', 19)`)),
    ).rejects.toThrow(/row-level security/)
    expect(await rows(U.super, 'select id from public.members order by id')).toEqual(before)
  })

  it('학회원은 다른 사람의 경력을 고치거나 지울 수 없다', async () => {
    // 관리자였던 U.admin 을 일반 학회원으로 내려 두고, 경력 주인(M.member)이 아닌 승인된 학회원으로 시도한다
    await db.exec(`update public.accounts set role = '학회원' where user_id = '${U.admin}'`)
    const before = await rows(U.super, 'select id, company, title from public.careers order by id')
    await asUser(db, U.admin, () => db.exec(`update public.careers set title = '변조' where member_id = '${M.member}'`))
    await asUser(db, U.admin, () => db.exec(`delete from public.careers where member_id = '${M.member}'`))
    expect(await rows(U.super, 'select id, company, title from public.careers order by id')).toEqual(before)
    expect(before).toHaveLength(2)
  })

  it('학회원은 경력을 추가할 수 없다', async () => {
    await expect(
      asUser(db, U.member, () => db.exec(`insert into public.careers (member_id, company) values ('${M.member}', '가짜')`)),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('수정자 기록', () => {
  const SPOOF = '99999999-9999-9999-9999-999999999999'

  it('학회원을 추가할 때 수정자와 수정 시각을 꾸며도 로그인한 관리자와 현재 시각으로 덮어쓴다', async () => {
    await asUser(db, U.admin, () =>
      db.exec(`insert into public.members (id, name, cohort, updated_by, updated_at)
        values ('10000000-0000-0000-0000-0000000000b1', '테스트추가', 19, '${SPOOF}', '2000-01-01')`),
    )
    const [r] = await rows(U.super, `select updated_by, updated_at > now() - interval '1 hour' as fresh
      from public.members where id = '10000000-0000-0000-0000-0000000000b1'`)
    expect(r).toEqual({ updated_by: U.admin, fresh: true })
  })

  it('경력을 추가할 때 수정자와 수정 시각을 꾸며도 덮어쓴다', async () => {
    await asUser(db, U.admin, () =>
      db.exec(`insert into public.careers (id, member_id, company, updated_by, updated_at)
        values ('20000000-0000-0000-0000-0000000000b1', '${M.free}', '가짜은행', '${SPOOF}', '2000-01-01')`),
    )
    const [r] = await rows(U.super, `select updated_by, updated_at > now() - interval '1 hour' as fresh
      from public.careers where id = '20000000-0000-0000-0000-0000000000b1'`)
    expect(r).toEqual({ updated_by: U.admin, fresh: true })
  })

  it('경력을 고치면 수정자가 고친 사람으로 바뀐다', async () => {
    const [before] = await rows(U.super, `select updated_by from public.careers where company = '가짜증권'`)
    expect(before.updated_by).toBeNull()
    await asUser(db, U.admin, () =>
      db.exec(`update public.careers set title = '대리', updated_by = '${SPOOF}' where company = '가짜증권'`),
    )
    const [after] = await rows(U.super, `select updated_by, title from public.careers where company = '가짜증권'`)
    expect(after).toEqual({ updated_by: U.admin, title: '대리' })
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

  it('이미 승인된 계정이 연결된 학회원을 자기 사람이라고 신청할 수 없다', async () => {
    await expect(
      asUser(db, U.stranger, () =>
        db.exec(`insert into public.accounts (user_id, member_id) values ('${U.stranger}', '${M.member}')`),
      ),
    ).rejects.toThrow(/이미 다른 계정과 연결된 학회원입니다/)
    expect(await rows(U.super, `select user_id from public.accounts where user_id = '${U.stranger}'`)).toHaveLength(0)
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

describe('가입 신청 화면 지원', () => {
  it('로그인한 사람은 현재 기수부터 1기까지 기수 선택지를 받는다', async () => {
    const r = await rows(U.stranger, 'select * from public.signup_cohorts() as c')
    expect(r).toHaveLength(20)
    expect(r[0]).toEqual({ c: 20 })
    expect(r[19]).toEqual({ c: 1 })
  })

  it('가입 신청 때 로그인 계정의 이메일이 자동으로 남고, 꾸며 넣을 수 없다', async () => {
    await db.exec(`update auth.users set email = 'real@example.com' where id = '${U.stranger}'`)
    await asUser(db, U.stranger, () =>
      db.exec(`insert into public.accounts (user_id, member_id, email) values ('${U.stranger}', '${M.free}', 'fake@example.com')`),
    )
    const [r] = await rows(U.admin, `select email from public.accounts where user_id = '${U.stranger}'`)
    expect(r.email).toBe('real@example.com')
  })

  it('관리자도 계정의 이메일을 바꿀 수 없다', async () => {
    await db.exec(`update auth.users set email = 'real@example.com' where id = '${U.stranger}'`)
    await asUser(db, U.stranger, () =>
      db.exec(`insert into public.accounts (user_id, member_id) values ('${U.stranger}', '${M.free}')`),
    )
    await asUser(db, U.admin, () => db.exec(`update public.accounts set email = 'other@example.com' where user_id = '${U.stranger}'`))
    const [r] = await rows(U.admin, `select email from public.accounts where user_id = '${U.stranger}'`)
    expect(r.email).toBe('real@example.com')
  })

  it('가입 신청 때 로그인 계정 이름이 자동으로 남고, 꾸며 넣거나 바꿀 수 없다', async () => {
    await db.exec(`update auth.users set raw_user_meta_data = '{"full_name": " 진짜이름 ", "name": "다른이름"}' where id = '${U.stranger}'`)
    await asUser(db, U.stranger, () =>
      db.exec(`insert into public.accounts (user_id, member_id, login_name) values ('${U.stranger}', '${M.free}', '꾸민이름')`),
    )
    await asUser(db, U.admin, () => db.exec(`update public.accounts set login_name = '바꾼이름' where user_id = '${U.stranger}'`))
    const [r] = await rows(U.admin, `select login_name from public.accounts where user_id = '${U.stranger}'`)
    expect(r.login_name).toBe('진짜이름')
  })

  it('full_name 이 없으면 name 을 쓰고, 둘 다 없으면 비워 둔다', async () => {
    await db.exec(`update auth.users set raw_user_meta_data = '{"name": "카카오이름"}' where id = '${U.stranger}'`)
    await asUser(db, U.stranger, () =>
      db.exec(`insert into public.accounts (user_id, member_id) values ('${U.stranger}', '${M.free}')`),
    )
    const [r] = await rows(U.admin, `select login_name from public.accounts where user_id = '${U.stranger}'`)
    expect(r.login_name).toBe('카카오이름')
    const [p] = await rows(U.admin, `select login_name from public.accounts where user_id = '${U.pending}'`)
    expect(p.login_name).toBeNull()
  })

  it('다른 학회원은 계정 이메일을 볼 수 없다', async () => {
    await db.exec(`update auth.users set email = 'real@example.com' where id = '${U.stranger}'`)
    await asUser(db, U.stranger, () =>
      db.exec(`insert into public.accounts (user_id, member_id) values ('${U.stranger}', '${M.free}')`),
    )
    const r = await rows(U.member, `select email from public.accounts where user_id = '${U.stranger}'`)
    expect(r).toHaveLength(0)
  })
})

describe('결정 기록', () => {
  const decision = async () =>
    (await rows(U.super, `select status, decided_by, decided_at, reject_reason from public.accounts where user_id = '${U.pending}'`))[0]

  it('상태를 그대로 두고 결정자·결정 시각·거절 사유를 고쳐도 무시된다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.accounts set status = '승인' where user_id = '${U.pending}'`))
    const before = await decision()
    expect(before.decided_by).toBe(U.admin)
    await asUser(db, U.super, () =>
      db.exec(`update public.accounts set decided_by = '${U.super}', decided_at = '2000-01-01', reject_reason = '꾸민 사유'
        where user_id = '${U.pending}'`),
    )
    expect(await decision()).toEqual(before)
  })

  it('대기 상태의 신청에 거절 사유만 써 넣어도 무시된다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.accounts set reject_reason = '아직 결정 안 함' where user_id = '${U.pending}'`))
    expect(await decision()).toEqual({ status: '대기', decided_by: null, decided_at: null, reject_reason: null })
  })

  it('거절하면 사유가 남고, 나중에 승인하면 사유가 지워진다', async () => {
    await asUser(db, U.admin, () =>
      db.exec(`update public.accounts set status = '거절', reject_reason = '기수 불일치' where user_id = '${U.pending}'`),
    )
    expect(await decision()).toMatchObject({ status: '거절', decided_by: U.admin, reject_reason: '기수 불일치' })
    await asUser(db, U.super, () =>
      db.exec(`update public.accounts set status = '승인', reject_reason = '지워지지 않는 사유' where user_id = '${U.pending}'`),
    )
    expect(await decision()).toMatchObject({ status: '승인', decided_by: U.super, reject_reason: null })
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

describe('관리자끼리와 마지막 최고관리자', () => {
  // U.member 를 두 번째 관리자로 만들어 둔다 (SQL 편집기에서 하는 일에 해당)
  beforeEach(async () => {
    await db.exec(`update public.accounts set role = '관리자' where user_id = '${U.member}'`)
  })
  const acct = async (id: string) =>
    (await rows(U.super, `select role, status from public.accounts where user_id = '${id}'`))[0]

  it('관리자는 다른 관리자를 강등할 수 없다', async () => {
    await expect(
      asUser(db, U.admin, () => db.exec(`update public.accounts set role = '학회원' where user_id = '${U.member}'`)),
    ).rejects.toThrow(/관리자 계정은 최고 관리자만 바꿀 수 있습니다/)
    expect(await acct(U.member)).toEqual({ role: '관리자', status: '승인' })
  })

  it('관리자는 다른 관리자를 거절할 수 없다', async () => {
    await expect(
      asUser(db, U.admin, () => db.exec(`update public.accounts set status = '거절' where user_id = '${U.member}'`)),
    ).rejects.toThrow(/관리자 계정은 최고 관리자만 바꿀 수 있습니다/)
    expect(await acct(U.member)).toEqual({ role: '관리자', status: '승인' })
  })

  it('관리자는 다른 관리자 계정을 삭제할 수 없다', async () => {
    await expect(
      asUser(db, U.admin, () => db.exec(`delete from public.accounts where user_id = '${U.member}'`)),
    ).rejects.toThrow(/관리자 계정은 최고 관리자만 삭제할 수 있습니다/)
    expect(await acct(U.member)).toEqual({ role: '관리자', status: '승인' })
  })

  it('관리자는 자기 자신을 학회원으로 내릴 수 있다', async () => {
    await asUser(db, U.admin, () => db.exec(`update public.accounts set role = '학회원' where user_id = '${U.admin}'`))
    expect(await acct(U.admin)).toEqual({ role: '학회원', status: '승인' })
  })

  it('관리자는 자기 계정을 삭제할 수 있다', async () => {
    await asUser(db, U.admin, () => db.exec(`delete from public.accounts where user_id = '${U.admin}'`))
    expect(await rows(U.super, `select user_id from public.accounts where user_id = '${U.admin}'`)).toHaveLength(0)
  })

  it('관리자는 승인된 학회원을 관리자로 올릴 수 있다 (넘기기)', async () => {
    await db.exec(`update public.accounts set role = '학회원' where user_id = '${U.member}'`)
    await asUser(db, U.admin, () => db.exec(`update public.accounts set role = '관리자' where user_id = '${U.member}'`))
    expect(await acct(U.member)).toEqual({ role: '관리자', status: '승인' })
  })

  it('최고관리자는 관리자를 강등·거절·삭제할 수 있다', async () => {
    await asUser(db, U.super, () => db.exec(`update public.accounts set role = '학회원' where user_id = '${U.member}'`))
    expect(await acct(U.member)).toEqual({ role: '학회원', status: '승인' })
    await asUser(db, U.super, () => db.exec(`update public.accounts set status = '거절' where user_id = '${U.admin}'`))
    expect(await acct(U.admin)).toEqual({ role: '관리자', status: '거절' })
    await asUser(db, U.super, () => db.exec(`delete from public.accounts where user_id = '${U.admin}'`))
    expect(await rows(U.super, `select user_id from public.accounts where user_id = '${U.admin}'`)).toHaveLength(0)
  })

  it('하나뿐인 최고관리자는 자신을 강등하거나 거절할 수 없다', async () => {
    await expect(
      asUser(db, U.super, () => db.exec(`update public.accounts set role = '관리자' where user_id = '${U.super}'`)),
    ).rejects.toThrow(/마지막 최고 관리자/)
    await expect(
      asUser(db, U.super, () => db.exec(`update public.accounts set status = '거절' where user_id = '${U.super}'`)),
    ).rejects.toThrow(/마지막 최고 관리자/)
    expect(await acct(U.super)).toEqual({ role: '최고관리자', status: '승인' })
  })

  it('하나뿐인 최고관리자는 자신을 삭제할 수 없다', async () => {
    await expect(
      asUser(db, U.super, () => db.exec(`delete from public.accounts where user_id = '${U.super}'`)),
    ).rejects.toThrow(/마지막 최고 관리자/)
    expect(await acct(U.super)).toEqual({ role: '최고관리자', status: '승인' })
  })

  it('승인되지 않은 최고관리자 계정은 대신이 되지 못한다', async () => {
    await db.exec(`update public.accounts set role = '최고관리자' where user_id = '${U.pending}'`) // 대기 상태 그대로
    await expect(
      asUser(db, U.super, () => db.exec(`update public.accounts set role = '관리자' where user_id = '${U.super}'`)),
    ).rejects.toThrow(/마지막 최고 관리자/)
    expect(await acct(U.super)).toEqual({ role: '최고관리자', status: '승인' })
  })

  it('최고관리자가 둘이면 한쪽이 다른 쪽을 강등할 수 있고, 자신을 내릴 수도 있다', async () => {
    await db.exec(`update public.accounts set role = '최고관리자' where user_id = '${U.admin}'`)
    await asUser(db, U.super, () => db.exec(`update public.accounts set role = '관리자' where user_id = '${U.admin}'`))
    expect(await acct(U.admin)).toEqual({ role: '관리자', status: '승인' })
    await db.exec(`update public.accounts set role = '최고관리자' where user_id = '${U.admin}'`)
    await asUser(db, U.super, () => db.exec(`update public.accounts set role = '관리자' where user_id = '${U.super}'`))
    expect(await acct(U.super)).toEqual({ role: '관리자', status: '승인' })
    expect(await acct(U.admin)).toEqual({ role: '최고관리자', status: '승인' })
  })

  describe('로그인 계정 바꿔치기', () => {
    const snapshot = () => rows(U.super, 'select user_id, member_id, role, status from public.accounts order by user_id')

    it('관리자는 다른 관리자의 로그인 계정을 다른 사람으로 바꿀 수 없다', async () => {
      const before = await snapshot()
      await expect(
        asUser(db, U.admin, () => db.exec(`update public.accounts set user_id = '${U.stranger}' where user_id = '${U.member}'`)),
      ).rejects.toThrow(/로그인 계정은 바꿀 수 없습니다/)
      expect(await snapshot()).toEqual(before)
    })

    it('관리자는 다른 관리자의 연결 학회원을 바꿀 수 없다', async () => {
      const before = await snapshot()
      await expect(
        asUser(db, U.admin, () => db.exec(`update public.accounts set member_id = '${M.free}' where user_id = '${U.member}'`)),
      ).rejects.toThrow(/관리자 계정은 최고 관리자만 바꿀 수 있습니다/)
      expect(await snapshot()).toEqual(before)
    })

    it('관리자는 학회원 행의 로그인 계정도 바꿀 수 없다', async () => {
      const before = await snapshot()
      await expect(
        asUser(db, U.admin, () => db.exec(`update public.accounts set user_id = '${U.stranger}' where user_id = '${U.pending}'`)),
      ).rejects.toThrow(/로그인 계정은 바꿀 수 없습니다/)
      expect(await snapshot()).toEqual(before)
    })

    it('최고관리자도 자기 행의 로그인 계정을 바꿀 수 없다', async () => {
      const before = await snapshot()
      await expect(
        asUser(db, U.super, () => db.exec(`update public.accounts set user_id = '${U.stranger}' where user_id = '${U.super}'`)),
      ).rejects.toThrow(/로그인 계정은 바꿀 수 없습니다/)
      expect(await snapshot()).toEqual(before)
    })

    it('관리자도 자기 행의 로그인 계정을 바꿀 수 없다', async () => {
      const before = await snapshot()
      await expect(
        asUser(db, U.admin, () => db.exec(`update public.accounts set user_id = '${U.stranger}' where user_id = '${U.admin}'`)),
      ).rejects.toThrow(/로그인 계정은 바꿀 수 없습니다/)
      expect(await snapshot()).toEqual(before)
    })

    it('일반 학회원은 자기 행을 고칠 수 없다 (행이 보이지 않아 아무 일도 일어나지 않는다)', async () => {
      await db.exec(`update public.accounts set role = '학회원' where user_id = '${U.member}'`)
      const before = await snapshot()
      await asUser(db, U.member, () => db.exec(`update public.accounts set user_id = '${U.stranger}' where user_id = '${U.member}'`))
      expect(await snapshot()).toEqual(before)
    })
  })

  it('SQL 편집기(postgres)에서는 이 검사를 받지 않는다', async () => {
    await db.exec(`update public.accounts set role = '관리자' where user_id = '${U.super}'`)
    expect(await acct(U.super)).toEqual({ role: '관리자', status: '승인' })
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

  it('회사 도메인은 관리자만 정하고, 승인된 학회원만 읽는다', async () => {
    await asUser(db, U.admin, () => db.exec(`insert into public.company_domains (company, domain) values ('가짜은행', 'fakebank.example')`))
    await asUser(db, U.member, () => db.exec(`insert into public.company_domains (company, domain) values ('가짜증권', 'fake.example')`)).catch(() => {})
    await asUser(db, U.member, () => db.exec(`update public.company_domains set domain = 'evil.example'`))
    expect(await rows(U.member, 'select company, domain from public.company_domains')).toEqual([{ company: '가짜은행', domain: 'fakebank.example' }])
    expect(await rows(U.stranger, 'select * from public.company_domains')).toHaveLength(0)
    await expect(rows(null, 'select * from public.company_domains')).rejects.toThrow(/permission denied/)
  })

  it('회사 도메인은 도메인 모양만 받는다', async () => {
    for (const bad of ['javascript:alert(1)', 'Fake.example', 'localhost', 'a b.com']) {
      await expect(asUser(db, U.admin, () => db.exec(`insert into public.company_domains (company, domain) values ('가짜', '${bad}')`))).rejects.toThrow(/check/)
    }
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
    const tables = ['settings', 'industries', 'job_functions', 'members', 'careers', 'accounts', 'audit_log', 'company_domains']
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

describe('함수 실행 권한', () => {
  const canExec = async (role: string, sig: string) =>
    (await db.query<{ ok: boolean }>(`select has_function_privilege('${role}', '${sig}', 'EXECUTE') as ok`)).rows[0].ok

  it('로그인하지 않은 사람은 권한 확인 함수와 가입 후보 함수를 부를 수 없다', async () => {
    for (const call of ['public.is_admin()', 'public.is_approved()', 'public.is_superadmin()', 'public.current_member_id()', 'public.signup_candidates(19)', 'public.signup_cohorts()']) {
      await expect(rows(null, `select * from ${call}`)).rejects.toThrow(/permission denied/)
    }
  })

  it('로그인한 사람은 권한 확인 함수와 가입 후보 함수를 부를 수 있다', async () => {
    expect(await rows(U.admin, 'select public.is_admin() as v')).toEqual([{ v: true }])
    expect(await rows(U.member, 'select public.is_admin() as v')).toEqual([{ v: false }])
    expect(await rows(U.stranger, 'select count(*)::int as n from public.signup_candidates(19)')).toEqual([{ n: 1 }])
  })

  // 예외는 하나: 드라이브 명단 동기화. 로그인할 수 없는 Apps Script 가 부르므로 anon 에게 열고,
  // 대신 함수 안에서 동기화 키를 확인한다 (tests/db/drive-access.test.ts)
  const ANON_ALLOWED = ['sync_drive_access(text,text[])']

  it('public 의 어떤 함수도 PUBLIC 에게 실행 권한이 없고, anon 은 동기화 함수만 부를 수 있다', async () => {
    const { rows: fns } = await db.query<{ sig: string; public_exec: boolean; anon_exec: boolean }>(
      `select p.oid::regprocedure::text as sig,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`,
    )
    expect(fns.length).toBeGreaterThan(5)
    expect(fns.filter((f) => f.public_exec || (f.anon_exec && !ANON_ALLOWED.includes(f.sig)))).toEqual([])
    expect(fns.filter((f) => f.anon_exec).map((f) => f.sig)).toEqual(ANON_ALLOWED)
  })

  it('로그인한 사람에게는 정책과 앱이 쓰는 함수의 실행 권한이 있다', async () => {
    for (const sig of ['public.is_approved()', 'public.is_admin()', 'public.is_superadmin()', 'public.current_member_id()', 'public.signup_candidates(int)', 'public.signup_cohorts()']) {
      expect([sig, await canExec('authenticated', sig)]).toEqual([sig, true])
    }
  })

  it('수정 기록 함수는 로그인한 사람에게도 실행 권한이 없다', async () => {
    expect(await canExec('authenticated', 'public.write_audit()')).toBe(false)
  })
})
