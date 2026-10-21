// 'GLIF Network 서버' 시트의 '연명부' 탭을 DB(members, careers)에 반영하는 SQL 을 만든다.
//
//   node scripts/import/sheet-sync.mjs [엑셀 경로] [추가 학회원 파일]
//
//   엑셀 경로 기본값: private/network.xlsx  (구글 드라이브에서 .xlsx 로 내려받은 파일)
//   추가 학회원 파일(기본 private/extra-members.txt): '기수 학과 학번 이름' 줄. 새 학회원의 학과를 채우는 데 쓴다.
//
// 만드는 파일: private/sheet-sync.sql  (Supabase SQL 편집기에서 실행. 여러 번 실행해도 같은 결과다)
//   - 시트에 있고 DB 에 없는 학회원(기수+이름)은 새로 추가한다
//   - 이미 있는 학회원은 바꾸지 않고, 비어 있는 학번·학과·연락처만 채운다
//   - 직장명이 있는 줄은 현직 경력으로 넣되, 같은 학회원에 같은 회사가 이미 있으면 넣지 않는다
//   - 기수가 '비학회원'인 줄은 DB 에 넣지 않는다 (개수만 알려 준다)
import ExcelJS from 'exceljs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TAB = '연명부'
const HEADERS = ['학번', '기수', '성함', '직장명', '부서명', '연락처']
const PERSONAL_DOMAINS = ['gmail.com', 'naver.com', 'hotmail.com', 'outlook.com', 'daum.net', 'hanmail.net', 'kakao.com', 'icloud.com', 'nate.com', 'yahoo.com']
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^010-\d{4}-\d{4}$/

const clean = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
const cell = (ws, r, c) => clean(ws.getCell(r, c).text)

// 시트의 줄 하나 = 한 사람의 한 직장. 같은 사람이 겸직이면 여러 줄이다.
export async function readNetworkSheet(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet(TAB)
  if (!ws) throw new Error(`'${TAB}' 탭을 찾지 못했습니다. 탭 이름이 정확히 '${TAB}' 인지 확인하세요`)
  const header = HEADERS.map((_, i) => cell(ws, 1, i + 1))
  if (header.join('|') !== HEADERS.join('|')) throw new Error(`1행(A1~F1)이 '${HEADERS.join(', ')}' 순서가 아닙니다: ${header.join(', ')}`)

  const rows = []
  const problems = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const [year, cohortText, name, company, team, contact] = HEADERS.map((_, i) => cell(ws, r, i + 1))
    if (!name && !cohortText) continue
    const where = `${r}행 ${name}`
    if (!name) {
      problems.push(`${r}행: 성함이 비어 있음`)
      continue
    }
    const outsider = cohortText === '비학회원'
    const cohort = outsider ? null : Number(cohortText.replace(/기$/, ''))
    if (!outsider && !Number.isInteger(cohort)) {
      problems.push(`${where}: 기수를 읽지 못함 (${cohortText})`)
      continue
    }
    const studentYear = /^\d{1,2}(\.0)?$/.test(year) ? Number(year) : null
    rows.push({ where, outsider, cohort, name, studentYear, company, team, contact })
  }
  return { rows, problems }
}

export function parseExtraMembers(text) {
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(\d{1,2})\s+(.+)$/)
    if (m) out.push({ cohort: Number(m[1]), name: m[4].trim(), department: m[2], studentYear: Number(m[3]) })
  }
  return out
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const v = (x, f = q) => (x === null || x === undefined || x === '' ? 'null' : f(x))

// 시트 줄을 사람별로 모은다 (기수+이름). 연락처는 번호/이메일로 나눈다.
export function groupPeople(rows, extras = []) {
  const people = new Map()
  for (const r of rows) {
    if (r.outsider) continue
    const key = `${r.cohort}:${r.name}`
    const p = people.get(key) ?? { name: r.name, cohort: r.cohort, studentYear: null, department: null, phone: null, personalEmail: null, workEmail: null, jobs: [] }
    p.studentYear ??= r.studentYear
    if (PHONE.test(r.contact)) p.phone ??= r.contact
    else if (EMAIL.test(r.contact)) {
      if (PERSONAL_DOMAINS.includes(r.contact.split('@')[1].toLowerCase())) p.personalEmail ??= r.contact.toLowerCase()
      else p.workEmail ??= r.contact.toLowerCase()
    }
    if (r.company && !p.jobs.some((j) => j.company === r.company && j.team === (r.team || null))) p.jobs.push({ company: r.company, team: r.team || null })
    people.set(key, p)
  }
  for (const x of extras) {
    const p = people.get(`${x.cohort}:${x.name}`)
    if (p) {
      p.department ??= x.department
      p.studentYear ??= x.studentYear
    }
  }
  return [...people.values()]
}

export function toSql(people) {
  const members = people.map((p) => `  (${q(p.name)}, ${p.cohort}, ${v(p.studentYear, String)}, ${v(p.department)}, ${v(p.phone)}, ${v(p.personalEmail)}, ${v(p.workEmail)})`).join(',\n')
  const jobs = people.flatMap((p) => p.jobs.map((j) => `  (${q(p.name)}, ${p.cohort}, ${q(j.company)}, ${v(j.team)})`)).join(',\n')
  return `-- 시트의 '${TAB}' 탭에서 자동 생성. 실제 이름과 연락처가 들어 있으니 저장소에 올리지 않는다.
-- 여러 번 실행해도 된다: 있는 사람은 바꾸지 않고, 비어 있는 칸만 채우고, 같은 회사 경력은 다시 넣지 않는다.

-- 1) 없는 학회원 추가
with src(name, cohort, student_year, department, phone, personal_email, work_email) as (
  values
${members}
)
insert into public.members (name, cohort, student_year, department, phone, personal_email, work_email)
select s.name, s.cohort::int, s.student_year::int, s.department, s.phone, s.personal_email, s.work_email
from src s
where not exists (select 1 from public.members m where m.name = s.name and m.cohort = s.cohort::int);

-- 2) 이미 있는 학회원은 비어 있는 학번·학과·연락처만 채움
with src(name, cohort, student_year, department, phone, personal_email, work_email) as (
  values
${members}
)
update public.members m
set student_year = coalesce(m.student_year, s.student_year::int),
    department = coalesce(m.department, s.department),
    phone = coalesce(m.phone, s.phone),
    personal_email = coalesce(m.personal_email, s.personal_email),
    work_email = coalesce(m.work_email, s.work_email)
from src s
where m.name = s.name and m.cohort = s.cohort::int;
${
  jobs
    ? `
-- 3) 현직 경력 (같은 학회원에 같은 회사가 이미 있으면 넣지 않음)
with src(name, cohort, company, team) as (
  values
${jobs}
)
insert into public.careers (member_id, kind, is_current, company, team)
select m.id, '정규', true, s.company, s.team
from src s
join public.members m on m.name = s.name and m.cohort = s.cohort::int
where not exists (select 1 from public.careers c where c.member_id = m.id and c.company = s.company);
`
    : ''
}`
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const xlsx = process.argv[2] ?? join(root, 'private', 'network.xlsx')
  const extraPath = process.argv[3] ?? join(root, 'private', 'extra-members.txt')

  const { rows, problems } = await readNetworkSheet(xlsx)
  const extras = existsSync(extraPath) ? parseExtraMembers(readFileSync(extraPath, 'utf8')) : []
  const people = groupPeople(rows, extras)

  mkdirSync(join(root, 'private'), { recursive: true })
  const out = join(root, 'private', 'sheet-sync.sql')
  writeFileSync(out, toSql(people))

  const cohorts = people.map((p) => p.cohort)
  console.log(`시트에서 읽은 줄: ${rows.length}줄 (비학회원 ${rows.filter((r) => r.outsider).length}줄은 DB 에 넣지 않음)`)
  console.log(`학회원 ${people.length}명, 기수 ${Math.min(...cohorts)}~${Math.max(...cohorts)}, 현직 경력 후보 ${people.reduce((a, p) => a + p.jobs.length, 0)}건`)
  console.log(`새로 알게 된 학과 정보: ${people.filter((p) => p.department).length}명 / 이메일·번호 있는 사람: ${people.filter((p) => p.phone || p.personalEmail || p.workEmail).length}명`)
  if (problems.length) {
    console.log(`\n확인이 필요한 줄 ${problems.length}건:`)
    for (const p of problems) console.log(`  - ${p}`)
  }
  console.log(`\n만든 파일: ${out}`)
  console.log('이 파일 전체를 Supabase SQL 편집기에 붙여 넣고 Run 하세요.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
