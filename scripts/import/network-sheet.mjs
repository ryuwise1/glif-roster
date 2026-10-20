// 연명부 엑셀을 'GLIF Network 서버' 시트 형식으로 정리한다.
//
//   node scripts/import/network-sheet.mjs [엑셀 경로] [명단 HTML 경로] [추가 학회원 파일]
//
// 만드는 파일: private/GLIF Network 서버.xlsx  (/private/ 아래라 git 에 올라가지 않는다)
//   시트 이름 '연명부', 1행 헤더: 학번 | 기수 | 성함 | 직장명 | 부서명 | 연락처
//   - 기수 오름차순. 같은 기수에서는 회장·부회장이 먼저, 그다음 가나다순
//   - 명단(glifskku.com)의 학회원은 모두 들어간다. 현직 정보가 없으면 직장명·부서명은 비워 둔다
//   - 엑셀에는 있지만 명단에 없는 사람은 기수를 '비학회원'으로 두고 맨 아래에 모은다
//   - 학번 열은 텍스트로 저장해 '2.02E+09' 처럼 깨지지 않게 한다
import ExcelJS from 'exceljs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMembers } from './glifskku-members.mjs'
import { buildImport, readWorkbook, resolveMember } from './excel-roster.mjs'

// 사이트 명단에 아직 없는 학회원(예: 새 기수)을 줄마다 '기수 학과 학번 이름' 으로 적은 파일을 읽는다.
//   20 글로벌경영 22 홍길동
export function parseExtraMembers(text) {
  const members = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(\d{1,2})\s+(.+)$/)
    if (m) members.push({ cohort: Number(m[1]), name: m[4].trim(), role: null, department: m[2], studentYear: Number(m[3]) })
  }
  return members
}

export const HEADERS = ['학번', '기수', '성함', '직장명', '부서명', '연락처']
export const NON_MEMBER = '비학회원'

const currentJobs = (careers) => careers.filter((c) => c.isCurrent && c.kind === '정규')

// 현직마다 [직장명, 부서명] 한 쌍. 현직이 없으면 빈 쌍 하나(학회원이 목록에서 빠지지 않게).
// 겸직이면 원본 엑셀처럼 같은 사람이 직장마다 한 줄씩 나온다.
function jobCells(careers) {
  const seen = new Set()
  const jobs = []
  for (const c of currentJobs(careers)) {
    const key = `${c.company}|${c.team ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    jobs.push([c.company, c.team ?? ''])
  }
  return jobs.length ? jobs : [['', '']]
}

const contactOf = (p) => p?.phone ?? p?.personalEmail ?? p?.workEmail ?? ''

// 반환: { rows: [학번, 기수, 성함, 직장명, 부서명, 연락처][], counts }
export function buildSheetRows(data, members) {
  const result = buildImport(data, members)
  const byKey = new Map(result.people.map((p) => [`${p.member.cohort}:${p.member.name}`, p]))

  const memberRows = members.flatMap((m) => {
    const p = byKey.get(`${m.cohort}:${m.name}`)
    const year = m.studentYear ?? p?.studentYear ?? null
    return jobCells(p?.careers ?? []).map(([company, team]) => ({
      cohort: m.cohort,
      rank: m.role === '회장' ? 0 : m.role === '부회장' ? 1 : 2,
      name: m.name,
      cells: [year === null ? '' : String(year).padStart(2, '0'), m.cohort, m.name, company, team, contactOf(p)],
    }))
  })
  // Array.prototype.sort 는 안정 정렬이라 같은 사람의 직장 순서는 유지된다
  memberRows.sort((a, b) => a.cohort - b.cohort || a.rank - b.rank || a.name.localeCompare(b.name, 'ko'))

  // 명단에 없는 사람: 이름과 학번이 같은 줄을 한 사람으로 모은다
  const outsiders = new Map()
  for (const row of [...data.current, ...data.history]) {
    if (resolveMember(members, row).member) continue
    const key = `${row.name}:${row.studentYear ?? ''}`
    const o = outsiders.get(key) ?? { name: row.name, studentYear: row.studentYear, careers: [], email: null, phone: null }
    if (row.career) o.careers.push(row.career)
    o.email ??= row.email
    o.phone ??= row.phone
    outsiders.set(key, o)
  }
  const outsiderRows = [...outsiders.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .flatMap((o) =>
      jobCells(o.careers).map(([company, team]) => [o.studentYear === null ? '' : String(o.studentYear).padStart(2, '0'), NON_MEMBER, o.name, company, team, o.phone ?? o.email ?? '']),
    )

  const rows = [...memberRows.map((r) => r.cells), ...outsiderRows]
  const people = (list) => new Set(list.map((r) => `${r[1]}:${r[2]}`)).size
  const memberCells = memberRows.map((r) => r.cells)
  return {
    rows,
    counts: {
      members: people(memberCells),
      outsiders: people(outsiderRows),
      rows: rows.length,
      withJob: people(memberCells.filter((r) => r[3])),
      withContact: people(rows.filter((r) => r[5])),
      multiJob: memberCells.filter((r) => r[3]).length - people(memberCells.filter((r) => r[3])),
      cohorts: new Set(memberCells.map((r) => r[1])).size,
    },
  }
}

export async function writeSheet(rows, path) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('연명부', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = HEADERS.map((h, i) => ({ header: h, key: String(i), width: [8, 10, 12, 28, 28, 28][i] }))
  ws.getRow(1).font = { bold: true }
  for (const r of rows) ws.addRow(r)
  // 학번(A열)은 텍스트로: 앞자리 0 이 사라지거나 숫자 표기로 깨지지 않게 한다
  ws.getColumn(1).numFmt = '@'
  ws.getColumn(1).alignment = { horizontal: 'left' }
  await wb.xlsx.writeFile(path)
}

const csvCell = (v) => {
  const t = String(v ?? '')
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
export const toCsv = (rows) => [HEADERS, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const xlsx = process.argv[2] ?? join(root, 'private', 'roster.xlsx')
  const html = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : await (await fetch('https://glifskku.com/members.html')).text()
  const members = parseMembers(html).members
  const extraPath = process.argv[4] ?? join(root, 'private', 'extra-members.txt')
  if (existsSync(extraPath)) {
    for (const x of parseExtraMembers(readFileSync(extraPath, 'utf8'))) {
      if (!members.some((m) => m.cohort === x.cohort && m.name === x.name)) members.push(x)
    }
  }
  const data = await readWorkbook(xlsx)
  const { rows, counts } = buildSheetRows(data, members)

  mkdirSync(join(root, 'private'), { recursive: true })
  const out = join(root, 'private', 'GLIF Network 서버.xlsx')
  await writeSheet(rows, out)
  writeFileSync(join(root, 'private', 'GLIF Network 서버.csv'), toCsv(rows), 'utf8')

  console.log(`학회원 ${counts.members}명 (${counts.cohorts}개 기수), 비학회원 ${counts.outsiders}명, 전체 ${counts.rows}줄`)
  console.log(`현직 정보 있는 사람: ${counts.withJob}명 / 연락처 있는 사람: ${counts.withContact}명 / 겸직으로 늘어난 줄: ${counts.multiJob}줄`)
  console.log(`\n만든 파일: ${out}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
