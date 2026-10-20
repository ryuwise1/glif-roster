// 'GLIF 연명부_25-2 갱신.xlsx' 에서 경력·연락처·학번을 읽어, 이미 들어 있는 학회원에게 붙이는 SQL 을 만든다.
//
//   node scripts/import/excel-roster.mjs [엑셀 경로] [명단 HTML 경로]
//
//   엑셀 경로 기본값: private/roster.xlsx
//   명단: 기본은 glifskku.com/members.html (저장한 HTML 파일도 가능). 이름·학번으로 사람을 기수까지 맞추는 데 쓴다.
//
// 만드는 파일 (모두 /private/ 아래라 git 에 올라가지 않는다):
//   private/roster-import.sql   Supabase SQL 편집기에서 실행. 여러 번 실행해도 같은 결과다.
//   private/import-review.txt   확인 필요 목록(동명이인, 명단에 없는 사람 등). 회장이 확인한다.
//
// private/homecoming-2026-09.json (홈커밍 설문 응답)이 있으면 그 현직을 SQL 끝에 덧붙인다. homecoming-survey.mjs 참고.
//
// 먼저 glifskku-members.mjs 로 학회원 명단을 넣은 뒤에 실행한다 (경력은 그 학회원에게 붙는다).
// 사람 맞추기는 이름 + 학번(+기수)로 한다. 이름만으로는 맞추지 않는다.
import ExcelJS from 'exceljs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMembers } from './glifskku-members.mjs'

export const PERSONAL_DOMAINS = ['gmail.com', 'naver.com', 'hotmail.com', 'outlook.com', 'daum.net', 'hanmail.net', 'kakao.com', 'icloud.com', 'nate.com', 'yahoo.com']
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^010-\d{4}-\d{4}$/

// ---------- 셀 읽기 ----------
const clean = (s) =>
  String(s ?? '')
    .replace(/_x[0-9a-fA-F]{4}_/g, '') // 엑셀이 남기는 제어 문자 표기 (예: _x0008_)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
const text = (ws, r, c) => (c < 1 ? "" : clean(ws.getCell(r, c).text))
const intIn = (s) => {
  const m = String(s).match(/\d+/)
  return m ? Number(m[0]) : null
}
// 학번 칸: 숫자만 학번이다. 인턴 명단의 '25 하반기' 처럼 글자가 섞인 값은 인턴 시기라서 학번으로 읽지 않는다.
const studentYearOf = (s) => (/[가-힣]/.test(s) ? null : intIn(s))
const norm = (s) => s.toLowerCase().replace(/[\s,.\-_()·]/g, '')

function headerRow(ws, ...labels) {
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    const row = {}
    for (let c = 1; c <= ws.columnCount; c++) row[text(ws, r, c)] = c
    if (labels.every((l) => row[l])) return { r, col: row }
  }
  return null
}

// ---------- 날짜 ----------
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const year2 = (yy) => 2000 + yy

// '23.01~23.02', '24.下', '2021.10 ~ 현재', '2021.2~2021.7' → { startedOn, endedOn, current }
export function parsePeriod(raw) {
  const s = raw.replace(/\s+/g, '')
  let m = s.match(/^(\d{4})\.(\d{1,2})~(?:(\d{4})\.(\d{1,2})|현재)$/)
  if (m) {
    return {
      startedOn: iso(+m[1], +m[2], 1),
      endedOn: m[3] ? iso(+m[3], +m[4], lastDay(+m[3], +m[4])) : null,
      current: !m[3],
    }
  }
  m = s.match(/^(\d{2})\.(\d{1,2})~(\d{2})\.(\d{1,2})$/)
  if (m) return { startedOn: iso(year2(+m[1]), +m[2], 1), endedOn: iso(year2(+m[3]), +m[4], lastDay(year2(+m[3]), +m[4])), current: false }
  m = s.match(/^(\d{2})\.(\d{1,2})~$/) // 시작만 있고 끝나는 달을 모르는 기간
  if (m) return { startedOn: iso(year2(+m[1]), +m[2], 1), endedOn: null, current: false }
  m = s.match(/^(\d{2})\.([上下])$/)
  if (m) {
    const y = year2(+m[1])
    return m[2] === '上' ? { startedOn: iso(y, 1, 1), endedOn: iso(y, 6, 30), current: false } : { startedOn: iso(y, 7, 1), endedOn: iso(y, 12, 31), current: false }
  }
  return null
}

// ---------- 시트 읽기 ----------
const placeholder = (s) => !s || /^[-–—.]+$/.test(s)

// 회색 글씨(예: B7B7B7·999999·CCCCCC)는 연명부에서 "이전 직장" 표시다. 세 색 성분이 같은 밝은 회색이면 회색으로 본다.
export function isGrayFont(cell) {
  const m = /^(?:FF)?([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(cell.font?.color?.argb ?? '')
  if (!m || m[1] !== m[2] || m[2] !== m[3]) return false
  const level = parseInt(m[1], 16)
  return level >= 0x60 && level <= 0xee
}

// 현직 시트: '< 현직자 명단 >' '< 삼성증권 인턴 명단>' '< 인턴 명단 >' 소제목 아래로 한 줄에 한 명
function readCurrentSheet(ws, issues) {
  const h = headerRow(ws, '성함', '직장명')
  if (!h) throw new Error("현직 시트에서 '성함', '직장명' 열 제목을 찾지 못했습니다")
  const { col } = h
  const out = []
  let section = null
  for (let r = h.r - 1; r <= ws.rowCount; r++) {
    const first = text(ws, r, 2)
    if (first.startsWith('<')) {
      section = first.includes('삼성증권') ? 'samsung-intern' : first.includes('인턴') ? 'intern' : first.includes('현직') ? 'current' : null
      continue
    }
    if (!section || r <= h.r) continue
    const name = text(ws, r, col['성함'])
    if (!name || name === '성함') continue
    const company = text(ws, r, col['직장명'])
    const team = text(ws, r, col['부서명'] ?? 0)
    const contact = text(ws, r, col['연락처'] ?? 0)
    const row = {
      where: `현직 시트 ${r}행`,
      name,
      studentYear: studentYearOf(text(ws, r, col['학번'])),
      cohort: intIn(text(ws, r, col['기수'])),
      email: null,
      phone: null,
      career: null,
    }
    if (EMAIL.test(contact)) row.email = contact.toLowerCase()
    else if (PHONE.test(contact)) row.phone = contact
    if (!placeholder(company)) {
      const past = isGrayFont(ws.getCell(r, col['직장명']))
      const career = { kind: section === 'current' ? '정규' : '인턴', isCurrent: section === 'current' && !past, company, team: placeholder(team) ? null : team, title: null, startedOn: null, endedOn: null }
      if (section !== 'current') {
        const p = parsePeriod(contact)
        if (p) Object.assign(career, { startedOn: p.startedOn, endedOn: p.endedOn })
        else if (contact && !row.email && !row.phone) issues.push(`${row.where} ${name}: 인턴 기간을 읽지 못함 (${contact})`)
      }
      row.career = career
    }
    out.push(row)
  }
  return out
}

// 이력 시트: 학번·성함은 사람의 첫 줄에만 있고, 이어지는 줄은 같은 사람이다
function readHistorySheet(ws, issues) {
  const h = headerRow(ws, '성함', '근무년도')
  if (!h) return []
  const { col } = h
  const out = []
  let who = null
  for (let r = h.r + 1; r <= ws.rowCount; r++) {
    const name = text(ws, r, col['성함'])
    if (name) who = { name, studentYear: studentYearOf(text(ws, r, col['학번'])) }
    const company = text(ws, r, col['직장명'])
    if (!who || placeholder(company)) continue
    const period = text(ws, r, col['근무년도'])
    const p = parsePeriod(period)
    if (!p) issues.push(`이력 시트 ${r}행 ${who.name}: 근무년도를 읽지 못함 (${period})`)
    const title = text(ws, r, col['직위'] ?? 0)
    out.push({
      where: `이력 시트 ${r}행`,
      name: who.name,
      studentYear: who.studentYear,
      cohort: null,
      email: null,
      phone: null,
      career: {
        kind: title.includes('인턴') ? '인턴' : '정규',
        isCurrent: p?.current ?? false,
        company,
        team: placeholder(text(ws, r, col['부서명'] ?? 0)) ? null : text(ws, r, col['부서명']),
        title: placeholder(title) ? null : title,
        startedOn: p?.startedOn ?? null,
        endedOn: p?.endedOn ?? null,
      },
    })
  }
  return out
}

// 기수별 명단 시트: 기수마다 두 줄. 첫 줄 = 기수·회장·번호·학회원 이름들, 둘째 줄 = 부회장·번호·'글제 20' 같은 학과+학번
function readOfficerSheet(ws) {
  const h = headerRow(ws, '기수', '직책')
  if (!h) return { phones: [], years: [] }
  const { col } = h
  const phones = []
  const years = []
  for (let r = h.r + 1; r <= ws.rowCount; r++) {
    const cohort = intIn(text(ws, r, col['기수']))
    if (cohort === null || text(ws, r, col['직책']) !== '회장') continue
    for (const rr of [r, r + 1]) {
      const name = text(ws, rr, col['성함'])
      const phone = text(ws, rr, col['번호'])
      if (name && PHONE.test(phone)) phones.push({ name, cohort, phone })
    }
    for (let c = (col['번호'] ?? 5) + 1; c <= ws.columnCount; c++) {
      const name = text(ws, r, c)
      const year = intIn(text(ws, r + 1, c).match(/\d{2}\s*$/)?.[0] ?? '')
      if (name && year !== null) years.push({ name, cohort, studentYear: year })
    }
  }
  return { phones, years }
}

// ---------- 사람 맞추기 ----------
// 명단(glifskku)에서 이름이 같은 사람을 찾고, 기수·학번으로 좁힌다. 한 명으로 정해질 때만 맞춘 것으로 본다.
export function resolveMember(members, { name, cohort, studentYear }) {
  let c = members.filter((m) => m.name === name)
  if (c.length === 0) return { reason: '명단(glifskku)에 같은 이름이 없음' }
  if (cohort !== null) {
    c = c.filter((m) => m.cohort === cohort)
    if (c.length === 0) return { reason: `명단에 이 이름은 있지만 ${cohort}기가 아님` }
  }
  if (c.length > 1 && studentYear !== null) {
    const exact = c.filter((m) => m.studentYear === studentYear)
    c = exact.length ? exact : c.filter((m) => m.studentYear === null)
  }
  if (c.length === 0) return { reason: `학번 ${studentYear}과 맞는 사람이 없음` }
  if (c.length > 1) return { reason: `동명이인 ${c.length}명 (${c.map((m) => `${m.cohort}기`).join(', ')}) 중 구분할 수 없음` }
  const m = c[0]
  const warning = studentYear !== null && m.studentYear !== null && m.studentYear !== studentYear ? `학번이 다름: 엑셀 ${studentYear}, 명단 ${m.studentYear}` : null
  return { member: m, warning }
}

// ---------- 합치기 ----------
const sameCompany = (a, b) => {
  const x = norm(a)
  const y = norm(b)
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))
}

export function buildImport(workbookData, members) {
  const issues = [...workbookData.issues]
  const review = []
  const keyOf = (m) => `${m.cohort}:${m.name}`
  const people = new Map() // 키 → { member, email, personal, work, phone, careers[], years }
  const person = (m) => {
    if (!people.has(keyOf(m))) people.set(keyOf(m), { member: m, personalEmail: null, workEmail: null, phone: null, studentYear: null, careers: [] })
    return people.get(keyOf(m))
  }

  const rows = [...workbookData.current, ...workbookData.history]
  for (const row of rows) {
    const res = resolveMember(members, row)
    if (!res.member) {
      review.push(`${row.where} ${row.name}${row.studentYear !== null ? ` (학번 ${row.studentYear})` : ''}${row.cohort !== null ? ` ${row.cohort}기` : ''}: ${res.reason}`)
      continue
    }
    if (res.warning) issues.push(`${row.where} ${row.name}: ${res.warning}`)
    const p = person(res.member)
    if (row.email) {
      const domain = row.email.split('@')[1]
      if (PERSONAL_DOMAINS.includes(domain)) p.personalEmail ??= row.email
      else p.workEmail ??= row.email
    }
    if (row.phone) p.phone ??= row.phone
    if (!row.career) continue
    // 이력 시트의 현직 줄이 현직 시트의 같은 회사 줄과 겹치면 새로 만들지 않고 시작일·직위를 채운다
    const dup = p.careers.find(
      (c) => c.isCurrent && row.career.isCurrent && c.kind === row.career.kind && sameCompany(c.company, row.career.company),
    )
    if (dup) {
      dup.title ??= row.career.title
      dup.startedOn ??= row.career.startedOn
      dup.team ??= row.career.team
    } else {
      p.careers.push({ ...row.career })
    }
  }

  // 회장·부회장 번호와 비어 있는 학번 (기수가 명확하므로 이름+기수로 맞춘다)
  for (const x of workbookData.officerPhones) {
    const m = members.find((mm) => mm.name === x.name && mm.cohort === x.cohort)
    if (m) person(m).phone ??= x.phone
    else review.push(`기수별 명단 ${x.cohort}기 ${x.name}: 명단(glifskku)에 없음 (번호 ${x.phone} 를 넣지 못함)`)
  }
  for (const x of workbookData.officerYears) {
    const m = members.find((mm) => mm.name === x.name && mm.cohort === x.cohort)
    if (m && m.studentYear === null) person(m).studentYear ??= x.studentYear
  }

  // 인턴은 직급 칸에 '인턴'. 현직이 없는 사람은 가장 최근 인턴을 목록에 보이도록 현직으로 둔다.
  for (const p of people.values()) {
    const interns = p.careers.filter((c) => c.kind === '인턴')
    for (const c of interns) c.title ??= '인턴'
    if (interns.length && !p.careers.some((c) => c.isCurrent)) {
      const when = (c) => c.endedOn ?? c.startedOn ?? ''
      interns.reduce((a, b) => (when(b) > when(a) ? b : a)).isCurrent = true
    }
  }

  return { people: [...people.values()], review, issues }
}

// ---------- SQL ----------
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const v = (x, f = q) => (x === null || x === undefined ? 'null' : f(x))

export function toSql({ people }) {
  const contacts = people.filter((p) => p.personalEmail || p.workEmail || p.phone || p.studentYear !== null)
  const careers = people.flatMap((p) => p.careers.map((c) => ({ m: p.member, c })))

  const parts = ['-- 엑셀에서 자동 생성. 실제 이름과 연락처가 들어 있으니 저장소에 올리지 않는다.', '-- 여러 번 실행해도 된다: 같은 경력은 다시 넣지 않고, 연락처·학번은 비어 있는 칸만 채운다.', '']
  if (contacts.length) {
    parts.push(`-- 연락처와 학번 (${contacts.length}명)
with src(name, cohort, phone, personal_email, work_email, student_year) as (
  values
${contacts.map((p) => `  (${q(p.member.name)}, ${p.member.cohort}, ${v(p.phone)}, ${v(p.personalEmail)}, ${v(p.workEmail)}, ${v(p.studentYear, String)})`).join(',\n')}
)
update public.members m
set phone = coalesce(m.phone, s.phone),
    personal_email = coalesce(m.personal_email, s.personal_email),
    work_email = coalesce(m.work_email, s.work_email),
    student_year = coalesce(m.student_year, s.student_year::int)
from src s
where m.name = s.name and m.cohort = s.cohort::int;
`)
  }
  if (careers.length) {
    parts.push(`-- 경력 (${careers.length}건)
with src(name, cohort, kind, is_current, company, team, title, started_on, ended_on) as (
  values
${careers.map(({ m, c }) => `  (${q(m.name)}, ${m.cohort}, ${q(c.kind)}, ${c.isCurrent}, ${q(c.company)}, ${v(c.team)}, ${v(c.title)}, ${v(c.startedOn)}, ${v(c.endedOn)})`).join(',\n')}
)
insert into public.careers (member_id, kind, is_current, company, team, title, started_on, ended_on)
select m.id, s.kind::public.career_kind, s.is_current::boolean, s.company, s.team, s.title, s.started_on::date, s.ended_on::date
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where not exists (
  select 1 from public.careers c
  where c.member_id = m.id and c.kind = s.kind::public.career_kind and c.company = s.company
    and coalesce(c.team, '') = coalesce(s.team, '') and c.started_on is not distinct from s.started_on::date
);
`)
  }
  // 예전에 직급 없이 이전 경력으로만 들어간 인턴 줄에 직급 '인턴'과 현직 여부를 맞춘다
  const interns = careers.filter(({ c }) => c.kind === '인턴')
  if (interns.length) {
    parts.push(`-- 인턴 직급·현직 표시 (${interns.length}건)
with src(name, cohort, company, team, started_on, title, is_current) as (
  values
${interns.map(({ m, c }) => `  (${q(m.name)}, ${m.cohort}, ${q(c.company)}, ${v(c.team)}, ${v(c.startedOn)}, ${v(c.title)}, ${c.isCurrent})`).join(',\n')}
)
update public.careers c
set title = coalesce(c.title, s.title), is_current = s.is_current::boolean
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where c.member_id = m.id and c.kind = '인턴' and c.company = s.company
  and coalesce(c.team, '') = coalesce(s.team, '') and c.started_on is not distinct from s.started_on::date;
`)
  }
  // 예전에 현직으로 들어간 이전 직장(회색 글씨)을 이전 직장으로 고친다
  const past = careers.filter(({ c }) => !c.isCurrent && c.kind === '정규' && c.startedOn === null)
  if (past.length) {
    parts.push(`-- 이전 직장 표시 (${past.length}건)
with src(name, cohort, company, team) as (
  values
${past.map(({ m, c }) => `  (${q(m.name)}, ${m.cohort}, ${q(c.company)}, ${v(c.team)})`).join(',\n')}
)
update public.careers c
set is_current = false
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where c.member_id = m.id and c.is_current and c.kind = '정규' and c.company = s.company
  and coalesce(c.team, '') = coalesce(s.team, '');
`)
  }
  return parts.join('\n')
}

// ---------- 실행 ----------
export async function readWorkbook(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const sheet = (part) => wb.worksheets.find((w) => w.name.includes(part))
  const issues = []
  const cur = sheet('현직')
  if (!cur) throw new Error("'현직' 시트를 찾지 못했습니다")
  const hist = sheet('이력')
  const off = sheet('기수별')
  const { phones, years } = off ? readOfficerSheet(off) : { phones: [], years: [] }
  return {
    current: readCurrentSheet(cur, issues),
    history: hist ? readHistorySheet(hist, issues) : [],
    officerPhones: phones,
    officerYears: years,
    issues,
  }
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const xlsx = process.argv[2] ?? join(root, 'private', 'roster.xlsx')
  const htmlPath = process.argv[3]
  const html = htmlPath ? readFileSync(htmlPath, 'utf8') : await (await fetch('https://glifskku.com/members.html')).text()
  const members = parseMembers(html).members.map((m) => ({ ...m }))
  if (members.length === 0) throw new Error('학회원 명단을 읽지 못했습니다')

  const data = await readWorkbook(xlsx)
  const result = buildImport(data, members)

  mkdirSync(join(root, 'private'), { recursive: true })
  const sqlPath = join(root, 'private', 'roster-import.sql')
  const reviewPath = join(root, 'private', 'import-review.txt')
  // 홈커밍 설문 응답이 있으면 엑셀 뒤에 붙인다 (설문이 더 최근 값이라 마지막에 덮어쓴다)
  const surveyPath = join(root, 'private', 'homecoming-2026-09.json')
  let sql = toSql(result)
  if (existsSync(surveyPath)) {
    const { buildSurvey, surveySql } = await import('./homecoming-survey.mjs')
    const survey = buildSurvey(JSON.parse(readFileSync(surveyPath, 'utf8')), members, result.people)
    sql += '\n' + surveySql(survey)
    result.review.push(...survey.review)
    console.log(`홈커밍 설문: 현직 ${survey.actions.filter((a) => a.career).length}명 (같은 회사 ${survey.actions.filter((a) => a.keep).length}명), 확인 필요 ${survey.review.length}건`)
  }
  writeFileSync(sqlPath, sql)
  writeFileSync(
    reviewPath,
    [`# 확인 필요 (${result.review.length}건): 사람을 한 명으로 정하지 못해 넣지 않은 줄`, ...result.review.map((x) => `- ${x}`), '', `# 참고 (${result.issues.length}건): 넣었지만 확인하면 좋은 줄`, ...result.issues.map((x) => `- ${x}`), ''].join('\n'),
  )

  // 이름은 화면에 찍지 않는다. 개수만 보여 준다.
  const n = (f) => result.people.filter(f).length
  console.log(`엑셀에서 읽은 줄: 현직·인턴 ${data.current.length}, 이력 ${data.history.length}`)
  console.log(`경력을 붙일 학회원: ${n((p) => p.careers.length)}명, 경력 ${result.people.reduce((a, p) => a + p.careers.length, 0)}건`)
  console.log(`이메일: 개인 ${n((p) => p.personalEmail)}명, 직장 ${n((p) => p.workEmail)}명 / 번호: ${n((p) => p.phone)}명 / 학번 채움: ${n((p) => p.studentYear !== null)}명`)
  console.log(`확인 필요(넣지 않음): ${result.review.length}건, 참고: ${result.issues.length}건`)
  console.log(`\n만든 파일:\n  ${sqlPath}\n  ${reviewPath}`)
}

// await 하지 않는다: main 이 불러오는 homecoming-survey.mjs 가 이 파일을 다시 불러오므로, 이 파일의 평가가 먼저 끝나야 한다
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
