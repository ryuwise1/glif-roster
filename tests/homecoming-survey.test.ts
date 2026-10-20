import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createDb } from './db/harness'
import { buildSurvey, parseSurveyJob, sameCompany, surveySql } from '../scripts/import/homecoming-survey.mjs'

// 모두 가짜 데이터
const MEMBERS = [
  { name: '가짜하나', cohort: 1, studentYear: null },
  { name: '가짜둘', cohort: 18, studentYear: 20 },
  { name: '가짜셋', cohort: 18, studentYear: null },
  { name: '가짜넷', cohort: 7, studentYear: null },
]

describe('parseSurveyJob', () => {
  it.each([
    ['KB증권(시장리스크부)', { kind: '정규', company: 'KB증권', team: '시장리스크부' }],
    ['하일랜드가짜파트너스 | 투자본부 ', { kind: '정규', company: '하일랜드가짜파트너스', team: '투자본부' }],
    ['가짜자산운용/리서치센터', { kind: '정규', company: '가짜자산운용', team: '리서치센터' }],
    ['Morgan Stanley, Fixed Income Division', { kind: '정규', company: 'Morgan Stanley', team: 'Fixed Income Division' }],
    ['신한투자증권 리서치센터', { kind: '정규', company: '신한투자증권', team: '리서치센터' }],
    ['BofA증권 FICC 세일즈', { kind: '정규', company: 'BofA증권', team: 'FICC 세일즈' }],
    ['Nh아문디 자산운용', { kind: '정규', company: 'Nh아문디 자산운용', team: null }],
    ['이마트', { kind: '정규', company: '이마트', team: null }],
    ['KB증권 PBS영업부 - 인턴', { kind: '인턴', company: 'KB증권', team: 'PBS영업부' }],
    ['PwC컨설팅 인턴', { kind: '인턴', company: 'PwC컨설팅', team: null }],
    ['제주대학교 법학전문대학원 재학 중 ', { kind: '학업', company: '제주대학교', team: '법학전문대학원' }],
    ['KAIST 경영대학', { kind: '학업', company: 'KAIST 경영대학', team: null }],
  ])('%s', (raw, want) => {
    expect(parseSurveyJob(raw)).toEqual(want)
  })

  it.each(['없음', '미정', 'x', ' ', '재학중', '학교 재학중', '기존 기입과 동일'])('넣을 게 없는 답 "%s"', (raw) => {
    expect(parseSurveyJob(raw)).toBeNull()
  })

  it('회사 없이 부서만 적으면 확인 필요로 돌린다', () => {
    expect(parseSurveyJob('기업금융부')).toEqual({ review: '회사 이름 없이 부서만 적음' })
  })
})

describe('sameCompany', () => {
  it.each([
    ['케이비증권', 'KB증권'],
    ['BofA증권', 'Bank of America'],
    ['Societe General', '소시에테제네랄'],
    ['삼일회계법인', '삼일 PwC'],
    ['아이엔지은행 서울지점', 'ING은행 서울지점'],
    ['HSBC증권', 'HSBC Securities Korea'],
    ['KPMG Deutschland', 'KPMG Germany'],
    ['가짜대학교법전원', '가짜대학교'],
  ])('%s = %s', (a, b) => expect(sameCompany(a, b)).toBe(true))

  it.each([
    ['메릴린치 증권', 'BofA증권'],
    ['삼성증권', '삼성자산운용'],
    ['KB증권', 'KB국민은행'],
  ])('%s ≠ %s', (a, b) => expect(sameCompany(a, b)).toBe(false))
})

describe('buildSurvey', () => {
  const people = [
    {
      member: MEMBERS[0],
      careers: [
        { kind: '정규', isCurrent: true, company: '메릴린치 증권', team: 'FICC Sales' },
        { kind: '정규', isCurrent: false, company: 'Bank of America', team: 'FICC Sales' },
      ],
    },
  ]

  it('같은 회사는 이미 있는 줄을 쓰고, 기수를 확실히 적지 않았으면 이름으로 찾는다', () => {
    const { actions, review } = buildSurvey(
      [
        ['가짜하나', 'OB', 'BofA증권 FICC 세일즈', 'one@gmail.com'],
        ['가짜넷', '7기였나..?', '가짜증권', 'four@fakefirm.co.kr'],
        ['없는사람', '3기', '가짜은행', ''],
      ],
      MEMBERS,
      people,
    )
    expect(actions[0].keep).toEqual(people[0].careers[1])
    expect(actions[0].personalEmail).toBe('one@gmail.com')
    expect(actions[1]).toMatchObject({ member: MEMBERS[3], keep: null, workEmail: 'four@fakefirm.co.kr' })
    expect(review).toHaveLength(1)
  })

  it('기존 부서가 설문 부서를 담고 있으면 더 자세한 기존 값을 두고, 구분은 설문 값을 따른다', () => {
    const mine = [
      { member: MEMBERS[1], careers: [{ kind: '정규', isCurrent: true, company: '가짜증권', team: 'S&T부문 ALB팀' }] },
      { member: MEMBERS[2], careers: [{ kind: '정규', isCurrent: true, company: '가짜대학교', team: '법학전문대학원' }] },
    ]
    const { actions } = buildSurvey(
      [
        ['가짜둘', '18기', '가짜증권 ALB팀', ''],
        ['가짜셋', '18기', '가짜대학교법전원', ''],
      ],
      MEMBERS,
      mine,
    )
    expect(actions[0].career).toMatchObject({ kind: '정규', company: '가짜증권', team: 'S&T부문 ALB팀', title: null })
    expect(actions[1].keep).toBe(mine[1].careers[0])
    // 같은 회사면 기존 이름을 둔다
    expect(actions[1].career).toMatchObject({ kind: '학업', company: '가짜대학교', team: '법학전문대학원' })
  })

  it('회장 보정: 구분, 같은 회사 지정, 이름 바꾸기, 시작일·지역, 기수 무시', () => {
    const mine = [{ member: MEMBERS[1], careers: [{ kind: '정규', isCurrent: true, company: 'PwC', team: 'Industry Solution' }] }]
    const { actions, review } = buildSurvey(
      [
        ['가짜둘', '18기', 'PwC컨설팅 (EUR)', '', { sameAs: 'PwC', rename: true, startedOn: '2024-05-01', region: '서울' }],
        ['가짜셋', '18기', '가짜자산운용', '', { kind: '인턴' }],
        ['가짜넷', '3기', '가짜은행', '', { anyCohort: true }],
      ],
      MEMBERS,
      mine,
    )
    expect(review).toEqual([])
    expect(actions[0].keep).toBe(mine[0].careers[0])
    expect(actions[0].career).toEqual({ kind: '정규', company: 'PwC컨설팅', team: 'EUR', title: null, startedOn: '2024-05-01', region: '서울', merge: false })
    expect(actions[1].career).toMatchObject({ kind: '인턴', company: '가짜자산운용', title: '인턴' })
    expect(actions[2].member).toBe(MEMBERS[3])
  })
})

describe('surveySql 를 실제 DB 에 실행', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await createDb()
    for (const m of MEMBERS) {
      await db.query(`insert into public.members (name, cohort, student_year) values ($1, $2, $3)`, [m.name, m.cohort, m.studentYear])
    }
    await db.exec(`
      insert into public.careers (member_id, is_current, company, team)
      select id, true, '메릴린치 증권', 'FICC Sales' from public.members where name = '가짜하나'
      union all select id, false, 'Bank of America', 'FICC Sales' from public.members where name = '가짜하나'
      union all select id, true, '옛날회사', null from public.members where name = '가짜둘';
      update public.members set personal_email = 'keep@naver.com' where name = '가짜셋';
    `)
  })
  afterEach(async () => {
    await db.close()
  })

  const rows: unknown[][] = [
    ['가짜하나', '1기', 'Bank of America Merrill Lynch (Global Market - FICC Sales)', 'one@gmail.com', { rename: true, startedOn: '2019-05-01', region: '서울' }],
    ['가짜둘', '18기', '새가짜증권 리서치센터', 'two@fakefirm.co.kr'],
    ['가짜셋', '18기', '없음', 'new@gmail.com'],
  ]
  const people = [
    {
      member: MEMBERS[0],
      careers: [
        { kind: '정규', isCurrent: true, company: '메릴린치 증권', team: 'FICC Sales' },
        { kind: '정규', isCurrent: false, company: 'Bank of America', team: 'FICC Sales' },
      ],
    },
    { member: MEMBERS[1], careers: [{ kind: '정규', isCurrent: true, company: '옛날회사', team: null }] },
  ]
  const sql = () => surveySql(buildSurvey(rows, MEMBERS, people))
  const careersOf = async (name: string) =>
    (
      await db.query(
        `select c.company, c.team, c.is_current from public.careers c join public.members m on m.id = c.member_id where m.name = $1 order by c.is_current desc, c.company`,
        [name],
      )
    ).rows

  it('설문 회사만 현직으로 남기고 나머지는 이전 경력으로 내린다', async () => {
    await db.exec(sql())
    expect(await careersOf('가짜하나')).toEqual([
      { company: 'Bank of America Merrill Lynch', team: 'Global Market - FICC Sales', is_current: true },
      { company: '메릴린치 증권', team: 'FICC Sales', is_current: false },
    ])
    const r = await db.query(`select started_on::text, region from public.careers where company = 'Bank of America Merrill Lynch'`)
    expect(r.rows).toEqual([{ started_on: '2019-05-01', region: '서울' }])
    expect(await careersOf('가짜둘')).toEqual([
      { company: '새가짜증권', team: '리서치센터', is_current: true },
      { company: '옛날회사', team: null, is_current: false },
    ])
  })

  it('이메일은 비어 있는 칸만 채운다', async () => {
    await db.exec(sql())
    const r = await db.query(`select name, personal_email, work_email from public.members where name in ('가짜둘', '가짜셋') order by name`)
    expect(r.rows).toEqual([
      { name: '가짜둘', personal_email: null, work_email: 'two@fakefirm.co.kr' },
      { name: '가짜셋', personal_email: 'keep@naver.com', work_email: null },
    ])
  })

  it('여러 번 실행해도 같은 결과다', async () => {
    await db.exec(sql())
    const first = [await careersOf('가짜하나'), await careersOf('가짜둘')]
    await db.exec(sql())
    expect([await careersOf('가짜하나'), await careersOf('가짜둘')]).toEqual(first)
  })

  it('merge 면 같은 회사의 다른 줄을 지우고 가장 이른 시작일로 한 줄만 남긴다', async () => {
    await db.exec(`insert into public.careers (member_id, is_current, company, team, started_on)
      select id, false, 'PwC', 'Operation', date '2023-03-01' from public.members where name = '가짜넷'
      union all select id, true, 'PwC', 'Industry Solution', null::date from public.members where name = '가짜넷'`)
    const mine = [
      {
        member: MEMBERS[3],
        careers: [
          { kind: '정규', isCurrent: false, company: 'PwC', team: 'Operation', startedOn: '2023-03-01' },
          { kind: '정규', isCurrent: true, company: 'PwC', team: 'Industry Solution', startedOn: null },
        ],
      },
    ]
    const merged = surveySql(buildSurvey([['가짜넷', '7기', 'PwC컨설팅 (EUR)', '', { sameAs: 'PwC', rename: true, merge: true }]], MEMBERS, mine))
    await db.exec(merged)
    const after = await db.query(`select company, team, is_current, started_on::text from public.careers c join public.members m on m.id = c.member_id where m.name = '가짜넷'`)
    expect(after.rows).toEqual([{ company: 'PwC컨설팅', team: 'EUR', is_current: true, started_on: '2023-03-01' }])
    // 엑셀 단계가 두 줄을 다시 넣어도 한 줄로 돌아온다
    await db.exec(`insert into public.careers (member_id, is_current, company, team, started_on)
      select id, false, 'PwC', 'Operation', date '2023-03-01' from public.members where name = '가짜넷'
      union all select id, true, 'PwC', 'Industry Solution', null::date from public.members where name = '가짜넷'`)
    await db.exec(merged)
    expect((await db.query(`select company, team, is_current, started_on::text from public.careers c join public.members m on m.id = c.member_id where m.name = '가짜넷'`)).rows).toEqual(after.rows)
  })

  it('엑셀 반영이 고친 줄의 옛 모양을 다시 넣어도 설문 반영 뒤에는 처음과 같다', async () => {
    await db.exec(sql())
    const first = await careersOf('가짜하나')
    // roster-import.sql 을 다시 실행하면 엑셀 단계가 옛 부서 그대로 한 줄 더 넣는다
    await db.exec(`insert into public.careers (member_id, is_current, company, team)
      select id, false, 'Bank of America', 'FICC Sales' from public.members where name = '가짜하나'`)
    await db.exec(sql())
    expect(await careersOf('가짜하나')).toEqual(first)
  })
})
