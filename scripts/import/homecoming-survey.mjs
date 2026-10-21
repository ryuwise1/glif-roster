// 홈커밍 사전 설문(26-2) 응답의 현직을 연명부에 반영하는 SQL 을 만든다.
// 엑셀(25-2)보다 최근에 본인이 직접 적은 값이라 엑셀보다 우선한다.
//
// 입력: private/homecoming-2026-09.json   [[이름, 기수(적은 그대로), 현직(적은 그대로), 이메일], ...]
//       설문 시트에서 '동의함' 응답만 옮긴다. 회장이 확인해 고친 값은 다섯째 칸에 적는다:
//         { kind: '인턴' }         구분을 정해 준다
//         { sameAs: 'PwC' }        이 이름의 기존 경력을 같은 회사로 본다
//         { rename: true }         같은 회사여도 기존 이름 대신 설문에 적은 이름을 쓴다
//         { startedOn: 'YYYY-MM-DD', region: '서울' }
//         { anyCohort: true }      적은 기수가 명단과 달라도 이름으로 찾는다
//         { merge: true }          같은 회사의 다른 줄은 지우고 한 줄로 합친다
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
  [/macquarieassetmanagement|맥쿼리자산운용/g, '맥쿼리자산운용'],
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
  for (const [rawName, cohortRaw, job, email, opts = {}] of rows) {
    const name = rawName.trim()
    const res = resolveMember(members, { name, cohort: opts.anyCohort ? null : cohortOf(cohortRaw), studentYear: null })
    if (!res.member) {
      review.push(`설문 ${cohortRaw} ${name}: ${res.reason}`)
      continue
    }
    const m = res.member
    const parsed = parseSurveyJob(job)
    if (parsed?.review) review.push(`설문 ${m.cohort}기 ${m.name}: ${parsed.review} ("${job}")`)
    const parsedCareer = parsed && !parsed.review ? parsed : null

    let keep = null
    let career = null
    if (parsedCareer) {
      const kind = opts.kind ?? parsedCareer.kind
      // 구분(정규·인턴·학업)이 달라도 같은 회사면 그 줄을 쓰고, 구분은 설문 값으로 바꾼다
      const mine = people.find((p) => p.member.name === m.name && p.member.cohort === m.cohort)?.careers ?? []
      const same = mine.filter((c) => c.company === opts.sameAs || sameCompany(c.company, parsedCareer.company))
      keep = same.find((c) => c.isCurrent) ?? same[0] ?? null
      // 기존 부서가 설문 부서를 이미 담고 있으면 더 자세한 기존 값을 둔다 ('S&T부문 ALB팀' ⊃ 'ALB팀')
      const flat = (s) => s.toLowerCase().replace(/[\s()·,]/g, '')
      let team = parsedCareer.team
      if (keep?.team && (!team || flat(keep.team).includes(flat(team)))) team = keep.team
      career = {
        kind,
        // 같은 회사면 기존 이름을 둔다. rename 이면 설문(보정)에 적은 이름으로 바꾼다
        company: keep && !opts.rename ? keep.company : parsedCareer.company,
        team,
        title: kind === '인턴' ? '인턴' : null,
        // merge 면 같은 회사의 다른 줄은 지우고 하나로 합친다. 시작일은 가장 이른 날
        startedOn: opts.startedOn ?? (opts.merge ? (same.map((c) => c.startedOn).filter(Boolean).sort()[0] ?? null) : null),
        region: opts.region ?? null,
        merge: Boolean(opts.merge),
      }
    }
    const mail = EMAIL.test(email ?? '') ? email.trim() : null
    const personal = mail && PERSONAL.includes(mail.split('@')[1].toLowerCase())
    actions.push({
      member: m,
      career,
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
    // company: 최종 회사 이름. keep_*: 엑셀에서 들어온, 같은 회사로 본 줄을 찾는 값
    const values = jobs
      .map(
        ({ member: m, career: c, keep }) =>
          `  (${q(m.name)}, ${m.cohort}, ${q(c.kind)}, ${q(c.company)}, ${v(c.team)}, ${v(c.title)}, ${v(c.startedOn)}, ${v(c.region)}, ${keep ? 'true' : 'false'}, ${v(keep?.company)}, ${v(keep?.team)}, ${v(keep?.kind)})`,
      )
      .join(',\n')
    const src = `with src(name, cohort, kind, company, team, title, started_on, region, has_keep, keep_company, keep_team, keep_kind) as (
  values
${values}
)`
    parts.push(`-- 설문 현직 (${jobs.length}명)
-- 0) 이 파일을 다시 실행하면 위의 엑셀 반영이 설문으로 고친 줄의 옛 모양을 또 넣는다. 그 줄을 지운다.
${src}
delete from public.careers c
using src s, public.members m
where m.name = s.name and m.cohort = s.cohort::int and s.has_keep::boolean
  and c.member_id = m.id and c.company = s.keep_company and c.kind = s.keep_kind::public.career_kind
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
where c.member_id = m.id and c.is_current and c.company <> s.company and c.company <> coalesce(s.keep_company, '');

-- 2) 같은 회사 경력이 없으면 새로 넣기
${src}
insert into public.careers (member_id, kind, is_current, company, team, title, started_on, region)
select m.id, s.kind::public.career_kind, true, s.company, s.team, s.title, s.started_on::date, s.region
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where not s.has_keep::boolean
  and not exists (select 1 from public.careers c where c.member_id = m.id and c.company = s.company);

-- 3) 이미 있던 같은 회사 경력은 현직으로 올리고 이름·구분·부서 등을 설문 값으로
${src}
update public.careers c
set is_current = true,
    company = s.company,
    kind = s.kind::public.career_kind,
    team = coalesce(s.team, c.team),
    title = coalesce(s.title, c.title),
    started_on = coalesce(s.started_on::date, c.started_on),
    region = coalesce(s.region, c.region)
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where s.has_keep::boolean and c.member_id = m.id and c.company = s.keep_company
  and (c.is_current or (coalesce(c.team, '') = coalesce(s.keep_team, '') and c.kind = s.keep_kind::public.career_kind));
`)
    const merges = jobs.filter((a) => a.career.merge && a.keep)
    if (merges.length) {
      parts.push(`-- 4) 한 줄로 합치기로 한 회사의 나머지 줄 지우기 (${merges.length}명)
with src(name, cohort, company, keep_company) as (
  values
${merges.map(({ member: m, career: c, keep }) => `  (${q(m.name)}, ${m.cohort}, ${q(c.company)}, ${q(keep.company)})`).join(',\n')}
)
delete from public.careers c
using src s, public.members m
where m.name = s.name and m.cohort = s.cohort::int and c.member_id = m.id
  and c.company = s.keep_company and c.company <> s.company
  and exists (select 1 from public.careers c2 where c2.member_id = m.id and c2.company = s.company and c2.is_current);
`)
    }
  }
  return parts.join('\n')
}
