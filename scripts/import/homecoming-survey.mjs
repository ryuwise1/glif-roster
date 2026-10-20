// 홈커밍 사전 설문(26-2) 응답의 현직을 연명부에 반영하는 SQL 을 만든다.
// 엑셀(25-2)보다 최근에 본인이 직접 적은 값이라 엑셀보다 우선한다.
//
// 입력: private/homecoming-2026-09.json   [[이름, 기수(적은 그대로), 현직(적은 그대로), 이메일], ...]
//       설문 시트에서 '동의함' 응답만 옮긴다.
// excel-roster.mjs 가 이 파일이 있으면 roster-import.sql 끝에 붙인다. 엑셀 반영 뒤에 돌아야 하기 때문이다.
//
// 반영 규칙
//   - 설문의 회사가 이미 있는 경력과 같은 회사면 그 줄을 현직으로 두고, 부서는 설문 값으로 바꾼다
//     (기존 부서가 설문 부서를 이미 담고 있으면 더 자세한 기존 값을 둔다).
//   - 없으면 설문의 회사를 현직으로 새로 넣는다.
//   - 그 밖의 현직은 지우지 않고 이전 경력으로 내린다.
//   - 이메일은 비어 있는 칸만 채운다.
import { EMAIL, PERSONAL_DOMAINS, resolveMember } from './excel-roster.mjs'

const SKIP = /^(x|없음|미정|\.|기존 기입과 동일|(학교 )?재학\s?중|재직중인 곳 없음|업데이트 했습니다)?$/i
const SCHOOL = /(대학교|대학원|법전원|경영대학|석사|박사)/
const COMPANY_END = /(증권|은행|운용|캐피탈|회계법인|홀딩스|투자자문|대학교|보험|화재|파트너스|해양|스페이스|중앙회|컨설팅)$/
const TEAM_ONLY = /(부|팀|본부|센터)$/
// 학교 메일은 개인 메일로 본다
const PERSONAL = [...PERSONAL_DOMAINS, 'g.skku.edu', 'skku.edu']

// 자유롭게 적은 현직 한 줄을 회사·부서·구분으로 나눈다. 넣을 게 없으면 null.
export function parseSurveyJob(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (SKIP.test(s)) return null
  let kind = '정규'
  if (/인턴/.test(s)) {
    kind = '인턴'
    s = s.replace(/\s*-?\s*인턴\s*/g, ' ').trim()
  }
  s = s.replace(/\s*재학\s?중\s*$/, '')
  if (SCHOOL.test(s)) kind = '학업'

  let company = s
  let team = null
  const paren = s.match(/^(.+?)\s*\((.+)\)$/)
  const sep = s.match(/^(.+?)\s*[|/,]\s*(.+)$/)
  if (paren) [company, team] = [paren[1], paren[2]]
  else if (sep) [company, team] = [sep[1], sep[2]]
  else {
    // '신한투자증권 리서치센터' 처럼 회사 이름 뒤에 부서를 띄어 적은 경우
    const sp = s.indexOf(' ')
    if (sp > 0 && COMPANY_END.test(s.slice(0, sp))) [company, team] = [s.slice(0, sp), s.slice(sp + 1)]
  }
  company = company.trim()
  team = team?.trim() || null
  if (TEAM_ONLY.test(company) && !COMPANY_END.test(company)) return { review: '회사 이름 없이 부서만 적음' }
  return { kind, company, team }
}

// 같은 회사를 다르게 적은 경우 (한글·영문 이름, 옛 이름)
const ALIASES = [
  [/케이비/g, 'kb'],
  [/아이엔지/g, 'ing'],
  [/bankofamerica|bofa/g, 'bofa'],
  [/societegenerale?|소시에테제네랄/g, 'socgen'],
  [/삼일회계법인|삼일pwc/g, '삼일pwc'],
  [/securities(korea)?/g, '증권'],
  [/deutschland/g, 'germany'],
  [/법전원|법학전문대학원/g, ''],
]
const canon = (s) => ALIASES.reduce((x, [re, to]) => x.replace(re, to), s.toLowerCase().replace(/[\s,.\-_()·&|/]/g, ''))
export function sameCompany(a, b) {
  const x = canon(a)
  const y = canon(b)
  if (x === y) return x.length > 0
  return Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))
}

// '7기', '12' 처럼 숫자만 적었을 때만 기수로 쓴다. '7기였나..?', 'OB', '창립' 은 이름으로만 찾는다.
const cohortOf = (raw) => (/^\s*\d+\s*기?\s*$/.test(raw) ? Number(raw.match(/\d+/)[0]) : null)

// people: excel-roster 의 buildImport 결과. 엑셀 반영 뒤의 경력으로 같은 회사를 찾는다.
export function buildSurvey(rows, members, people) {
  const review = []
  const actions = []
  for (const [rawName, cohortRaw, job, email] of rows) {
    const name = rawName.trim()
    const res = resolveMember(members, { name, cohort: cohortOf(cohortRaw), studentYear: null })
    if (!res.member) {
      review.push(`설문 ${cohortRaw} ${name}: ${res.reason}`)
      continue
    }
    const m = res.member
    const parsed = parseSurveyJob(job)
    if (parsed?.review) review.push(`설문 ${m.cohort}기 ${m.name}: ${parsed.review} ("${job}")`)
    const career = parsed && !parsed.review ? parsed : null

    let keep = null
    let team = career?.team ?? null
    if (career) {
      // 구분(정규·인턴·학업)이 달라도 같은 회사면 그 줄을 쓰고, 구분은 설문 값으로 바꾼다
      const mine = people.find((p) => p.member.name === m.name && p.member.cohort === m.cohort)?.careers ?? []
      const same = mine.filter((c) => sameCompany(c.company, career.company))
      keep = same.find((c) => c.isCurrent) ?? same[0] ?? null
      // 기존 부서가 설문 부서를 이미 담고 있으면 더 자세한 기존 값을 둔다 ('S&T부문 ALB팀' ⊃ 'ALB팀')
      const flat = (s) => s.toLowerCase().replace(/[\s()·,]/g, '')
      if (keep?.team && (!team || flat(keep.team).includes(flat(team)))) team = keep.team
    }
    const mail = EMAIL.test(email ?? '') ? email.trim() : null
    const personal = mail && PERSONAL.includes(mail.split('@')[1].toLowerCase())
    actions.push({
      member: m,
      career: career && { ...career, team },
      keep,
      personalEmail: personal ? mail : null,
      workEmail: mail && !personal ? mail : null,
    })
  }
  return { actions, review }
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const v = (x) => (x === null || x === undefined ? 'null' : q(x))

export function surveySql({ actions }) {
  const mails = actions.filter((a) => a.personalEmail || a.workEmail)
  const jobs = actions.filter((a) => a.career)
  const parts = [`-- ===== 홈커밍 설문(26-2) 반영: 엑셀보다 최근 값이라 엑셀 반영 뒤에 덮어쓴다 =====`, '']
  if (mails.length) {
    parts.push(`-- 설문 이메일, 비어 있는 칸만 (${mails.length}명)
with src(name, cohort, personal_email, work_email) as (
  values
${mails.map((a) => `  (${q(a.member.name)}, ${a.member.cohort}, ${v(a.personalEmail)}, ${v(a.workEmail)})`).join(',\n')}
)
update public.members m
set personal_email = coalesce(m.personal_email, s.personal_email),
    work_email = coalesce(m.work_email, s.work_email)
from src s
where m.name = s.name and m.cohort = s.cohort::int;
`)
  }
  if (jobs.length) {
    // company: 현직으로 둘 경력의 회사 (이미 있는 같은 회사면 그 이름), keep_team: 그 줄을 찾을 부서
    const values = jobs
      .map(({ member: m, career: c, keep }) =>
        `  (${q(m.name)}, ${m.cohort}, ${q(c.kind)}, ${q(keep ? keep.company : c.company)}, ${v(c.team)}, ${keep ? 'true' : 'false'}, ${v(keep?.team)}, ${v(keep?.kind)})`,
      )
      .join(',\n')
    const src = `with src(name, cohort, kind, company, team, has_keep, keep_team, keep_kind) as (
  values
${values}
)`
    parts.push(`-- 설문 현직 (${jobs.length}명)
-- 0) 이 파일을 다시 실행하면 위의 엑셀 반영이 설문으로 고친 줄의 옛 모양을 또 넣는다. 그 줄을 지운다.
${src}
delete from public.careers c
using src s, public.members m
where m.name = s.name and m.cohort = s.cohort::int and s.has_keep::boolean
  and c.member_id = m.id and c.company = s.company and c.kind = s.keep_kind::public.career_kind
  and coalesce(c.team, '') = coalesce(s.keep_team, '')
  and exists (
    select 1 from public.careers c2
    where c2.member_id = m.id and c2.id <> c.id and c2.company = s.company
      and c2.kind = s.kind::public.career_kind and coalesce(c2.team, '') = coalesce(s.team, s.keep_team, '')
  );

-- 1) 설문 회사가 아닌 현직은 이전 경력으로
${src}
update public.careers c
set is_current = false
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where c.member_id = m.id and c.is_current and c.company <> s.company;

-- 2) 같은 회사 경력이 없으면 새로 넣기
${src}
insert into public.careers (member_id, kind, is_current, company, team)
select m.id, s.kind::public.career_kind, true, s.company, s.team
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where not s.has_keep::boolean
  and not exists (select 1 from public.careers c where c.member_id = m.id and c.company = s.company);

-- 3) 이미 있던 같은 회사 경력은 현직으로 올리고 구분·부서를 설문 값으로
${src}
update public.careers c
set is_current = true, kind = s.kind::public.career_kind, team = coalesce(s.team, c.team)
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where s.has_keep::boolean and c.member_id = m.id and c.company = s.company
  and (c.is_current or coalesce(c.team, '') = coalesce(s.keep_team, ''));
`)
  }
  return parts.join('\n')
}
