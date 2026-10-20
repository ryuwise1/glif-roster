import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createDb } from './harness'
import { M, U, seed } from './fixtures'

let db: PGlite
beforeEach(async () => {
  db = await createDb()
  await seed(db)
})
afterEach(async () => {
  await db.close()
})

describe('members 제약', () => {
  it('기수 없이는 저장할 수 없다', async () => {
    await expect(db.exec(`insert into public.members (name) values ('기수없음')`)).rejects.toThrow(/null value in column "cohort"/)
  })

  it('기수는 1 이상이어야 한다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort) values ('영기수', 0)`),
    ).rejects.toThrow(/members_cohort_check/)
  })

  it('현재 기수보다 큰 기수는 저장할 수 없다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort) values ('미래기수', 21)`),
    ).rejects.toThrow(/현재 기수/)
  })

  it('휴대폰은 010-0000-0000 형식만 받는다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort, phone) values ('번호오류', 19, '01011112222')`),
    ).rejects.toThrow(/members_phone_check/)
  })

  it('숨김 항목은 연락처 항목만 받는다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort, hidden_fields) values ('숨김오류', 19, '{name}')`),
    ).rejects.toThrow(/members_hidden_fields_check/)
  })

  it('개인 이메일 형식이 틀리면 저장할 수 없다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort, personal_email) values ('메일오류', 19, 'not-an-email')`),
    ).rejects.toThrow(/members_personal_email_check/)
  })

  it('직장 이메일 형식이 틀리면 저장할 수 없다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort, work_email) values ('메일오류', 19, 'a@b')`),
    ).rejects.toThrow(/members_work_email_check/)
  })

  it('학년은 99를 넘을 수 없다', async () => {
    await expect(
      db.exec(`insert into public.members (name, cohort, student_year) values ('학년오류', 19, 100)`),
    ).rejects.toThrow(/members_student_year_check/)
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
    ).rejects.toThrow(/accounts_approved_needs_member/)
  })

  it('한 학회원에 승인된 계정은 하나뿐이다', async () => {
    await expect(
      db.exec(`update public.accounts set member_id = '${M.member}', status = '승인' where user_id = '${U.pending}'`),
    ).rejects.toThrow(/accounts_one_approved_per_member/)
  })

  it('학회원도 직접 입력도 없는 신청은 막는다', async () => {
    await expect(
      db.exec(`insert into public.accounts (user_id) values ('${U.stranger}')`),
    ).rejects.toThrow(/accounts_has_member_or_claim/)
  })

  it('직접 입력한 기수는 1 이상이어야 한다', async () => {
    await expect(
      db.exec(`insert into public.accounts (user_id, claimed_name, claimed_cohort) values ('${U.stranger}', '직접입력', 0)`),
    ).rejects.toThrow(/accounts_claimed_cohort_min/)
  })

  it('직접 입력한 기수는 현재 기수보다 클 수 없다', async () => {
    await expect(
      db.exec(`insert into public.accounts (user_id, claimed_name, claimed_cohort) values ('${U.stranger}', '직접입력', 21)`),
    ).rejects.toThrow(/현재 기수/)
  })

  it('직접 입력한 이름이 공백뿐이면 막는다', async () => {
    await expect(
      db.exec(`insert into public.accounts (user_id, member_id, claimed_name, claimed_cohort) values ('${U.stranger}', null, '  ', 19)`),
    ).rejects.toThrow(/accounts_claimed_name_not_blank/)
  })
})

describe('careers 제약', () => {
  it('직장 없이는 저장할 수 없다', async () => {
    await expect(
      db.exec(`insert into public.careers (member_id, company) values ('${M.member}', ' ')`),
    ).rejects.toThrow(/careers_company_check/)
  })

  it('종료일이 시작일보다 빠를 수 없다', async () => {
    await expect(
      db.exec(`insert into public.careers (member_id, company, started_on, ended_on) values ('${M.member}', '가짜', '2025-06-01', '2025-01-01')`),
    ).rejects.toThrow(/careers_period_order/)
  })

  it('업종 목록에 없는 업종은 저장할 수 없다', async () => {
    await expect(
      db.exec(`insert into public.careers (member_id, company, industry) values ('${M.member}', '가짜', '없는업종')`),
    ).rejects.toThrow(/careers_industry_fkey/)
  })
})

describe('학회원 삭제', () => {
  it('승인된 계정이 연결된 학회원은 삭제할 수 없다', async () => {
    await expect(db.exec(`delete from public.members where id = '${M.member}'`)).rejects.toThrow(/삭제할 수 없습니다/)
  })

  it('가입 신청(대기)이 연결된 학회원도 삭제할 수 없다', async () => {
    await expect(db.exec(`delete from public.members where id = '${M.pending}'`)).rejects.toThrow(/삭제할 수 없습니다/)
  })

  it('연결된 계정이 없는 학회원은 삭제할 수 있다', async () => {
    await db.exec(`delete from public.members where id = '${M.free}'`)
    const { rows } = await db.query(`select 1 from public.members where id = '${M.free}'`)
    expect(rows).toHaveLength(0)
  })
})
