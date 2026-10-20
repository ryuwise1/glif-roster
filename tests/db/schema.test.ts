import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createDb } from './harness'
import { M, U, seed } from './fixtures'

let db: PGlite
beforeEach(async () => {
  db = await createDb()
  await seed(db)
})

describe('members 제약', () => {
  it('기수 없이는 저장할 수 없다', async () => {
    await expect(db.exec(`insert into public.members (name) values ('기수없음')`)).rejects.toThrow()
  })

  it('현재 기수보다 큰 기수는 저장할 수 없다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort) values ('미래기수', 21)`),
    ).rejects.toThrow(/현재 기수/)
  })

  it('휴대폰은 010-0000-0000 형식만 받는다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort, phone) values ('번호오류', 19, '01011112222')`),
    ).rejects.toThrow()
  })

  it('숨김 항목은 연락처 항목만 받는다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort, hidden_fields) values ('숨김오류', 19, '{name}')`),
    ).rejects.toThrow()
  })

  it('수정하면 updated_at이 바뀐다', async () => {
    const before = (await db.query<{ t: string }>(`select updated_at::text t from public.members where id = '${M.member}'`)).rows[0].t
    await new Promise((r) => setTimeout(r, 10))
    await db.exec(`update public.members set department = '글로벌경제' where id = '${M.member}'`)
    const after = (await db.query<{ t: string }>(`select updated_at::text t from public.members where id = '${M.member}'`)).rows[0].t
    expect(after).not.toBe(before)
  })
})

describe('accounts 제약', () => {
  it('승인 상태는 연결된 학회원이 있어야 한다', async () => {
    await expect(
      db.exec(`update public.accounts set member_id = null, claimed_name = '직접입력', claimed_cohort = 20, status = '승인' where user_id = '${U.pending}'`),
    ).rejects.toThrow()
  })

  it('한 학회원에 승인된 계정은 하나뿐이다', async () => {
    await expect(
      db.exec(`update public.accounts set member_id = '${M.member}', status = '승인' where user_id = '${U.pending}'`),
    ).rejects.toThrow()
  })

  it('학회원도 직접 입력도 없는 신청은 막는다', async () => {
    await expect(
      db.exec(`insert into public.accounts (user_id) values ('${U.stranger}')`),
    ).rejects.toThrow()
  })
})

describe('careers 제약', () => {
  it('직장 없이는 저장할 수 없다', async () => {
    await expect(
      db.exec(`insert into public.careers (member_id, company) values ('${M.member}', ' ')`),
    ).rejects.toThrow()
  })

  it('종료일이 시작일보다 빠를 수 없다', async () => {
    await expect(
      db.exec(`insert into public.careers (member_id, company, started_on, ended_on) values ('${M.member}', '가짜', '2025-06-01', '2025-01-01')`),
    ).rejects.toThrow()
  })
})
