import type { PGlite } from '@electric-sql/pglite'

// 모두 가짜 데이터. 실제 학회원 정보를 넣지 않는다.
export const U = {
  super: '00000000-0000-0000-0000-000000000001',
  admin: '00000000-0000-0000-0000-000000000002',
  member: '00000000-0000-0000-0000-000000000003',
  pending: '00000000-0000-0000-0000-000000000004',
  stranger: '00000000-0000-0000-0000-000000000005',
} as const

export const M = {
  dev: '10000000-0000-0000-0000-000000000001', // 18기, 최고관리자와 연결
  admin: '10000000-0000-0000-0000-000000000002', // 19기 회장, 연락처 숨김
  member: '10000000-0000-0000-0000-000000000003', // 19기
  pending: '10000000-0000-0000-0000-000000000004', // 20기, 신청 대기
  free: '10000000-0000-0000-0000-000000000005', // 19기, 아직 아무도 연결 안 됨
} as const

export async function seed(db: PGlite): Promise<void> {
  await db.exec(`
    insert into auth.users (id) values
      ('${U.super}'), ('${U.admin}'), ('${U.member}'), ('${U.pending}'), ('${U.stranger}');

    insert into public.members (id, name, cohort, cohort_role, phone, hidden_fields) values
      ('${M.dev}',     '테스트개발', 18, null,   '010-1111-0001', '{}'),
      ('${M.admin}',   '테스트회장', 19, '회장', '010-1111-0002', '{phone}'),
      ('${M.member}',  '테스트회원', 19, null,   '010-1111-0003', '{}'),
      ('${M.pending}', '테스트대기', 20, null,   null,            '{}'),
      ('${M.free}',    '테스트미가입', 19, null, null,            '{}');

    insert into public.careers (member_id, kind, is_current, company) values
      ('${M.member}', '정규', true, '가짜증권'),
      ('${M.member}', '인턴', false, '가짜운용');

    insert into public.accounts (user_id, member_id, status, role) values
      ('${U.super}',   '${M.dev}',     '승인', '최고관리자'),
      ('${U.admin}',   '${M.admin}',   '승인', '관리자'),
      ('${U.member}',  '${M.member}',  '승인', '학회원'),
      ('${U.pending}', '${M.pending}', '대기', '학회원');
  `)
}
