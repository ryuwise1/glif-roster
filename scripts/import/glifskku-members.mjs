// glifskku.com/members.html 의 기수별 명단(이름·직책·학과·학번)을 읽어 members 에 넣는 SQL 을 만든다.
//
//   node scripts/import/glifskku-members.mjs                 # 사이트에서 바로 읽음
//   node scripts/import/glifskku-members.mjs 저장한파일.html  # 저장해 둔 HTML 에서 읽음
//
// 결과는 private/members-import.sql 에 쓴다. 실제 이름이 들어 있어 git 에 올라가지 않는 폴더(/private/)에만 둔다.
// 이 SQL 을 Supabase SQL 편집기에서 실행한다. 여러 번 실행해도 같은 결과다:
//  - 같은 이름·기수가 이미 있으면 새로 넣지 않고, 비어 있는 직책·학과·학번만 채운다.
//  - 직장·연락처는 이 페이지에 없다. 그것은 엑셀 이전(다음 단계)에서 넣는다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL_DEFAULT = 'https://glifskku.com/members.html'
const DEPARTMENTS = ['글로벌경제', '글로벌경영']

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')

// 카드마다 <p class="member-name">N기 이름(직책)</p> 다음에 <p class="member-dept">학과 학번</p> 가 온다
const CARD =
  /<p class="member-name">([^<]*)<\/p>\s*<p class="member-dept">([^<]*)<\/p>/g

export function parseMembers(html) {
  const members = []
  const problems = []
  for (const m of html.matchAll(CARD)) {
    const nameText = decode(m[1]).trim()
    const deptText = decode(m[2]).trim()
    const n = nameText.match(/^(\d+)기\s+(.+?)(?:\s*\((회장|부회장)\))?$/)
    if (!n) {
      problems.push(`이름 줄을 읽지 못함: ${nameText}`)
      continue
    }
    const cohort = Number(n[1])
    const name = n[2].trim()
    const role = n[3] ?? null
    const d = deptText.match(/^(\S+?)(?:\s+(\d{1,2}))?$/)
    const department = d && DEPARTMENTS.includes(d[1]) ? d[1] : null
    const studentYear = d?.[2] !== undefined ? Number(d[2]) : null
    if (deptText && !department) problems.push(`${cohort}기 ${name}: 학과를 알 수 없음 (${deptText})`)
    if (cohort < 1 || cohort > 99 || !name) {
      problems.push(`잘못된 행: ${nameText}`)
      continue
    }
    members.push({ cohort, name, role, department, studentYear })
  }

  // 같은 기수에 같은 이름이 둘 이상이면 SQL 이 한 사람으로 합치므로 알려 준다
  const seen = new Map()
  const unique = []
  for (const x of members) {
    const key = `${x.cohort}:${x.name}`
    if (seen.has(key)) {
      problems.push(`${x.cohort}기에 같은 이름이 두 번 나옴 (한 사람으로 합침): ${x.name}`)
      continue
    }
    seen.set(key, true)
    unique.push(x)
  }
  return { members: unique, problems }
}

const q = (s) => `'${s.replace(/'/g, "''")}'`
const lit = (v, f = q) => (v === null ? 'null' : f(v))

export function toSql(members) {
  const rows = members
    .map((m) => `  (${q(m.name)}, ${m.cohort}, ${lit(m.role)}, ${lit(m.department)}, ${lit(m.studentYear, String)})`)
    .join(',\n')
  return `-- glifskku.com 명단에서 자동 생성 (${members.length}명). 실제 이름이 들어 있으니 저장소에 올리지 않는다.
-- 여러 번 실행해도 된다: 같은 이름·기수가 있으면 새로 넣지 않고 비어 있는 직책·학과·학번만 채운다.
with src(name, cohort, cohort_role, department, student_year) as (
  values
${rows}
),
filled as (
  update public.members m
  set cohort_role = coalesce(m.cohort_role, s.cohort_role::public.cohort_role),
      department = coalesce(m.department, s.department),
      student_year = coalesce(m.student_year, s.student_year::int)
  from src s
  where m.name = s.name and m.cohort = s.cohort::int
  returning m.id
)
insert into public.members (name, cohort, cohort_role, department, student_year)
select s.name, s.cohort::int, s.cohort_role::public.cohort_role, s.department, s.student_year::int
from src s
where not exists (select 1 from public.members m where m.name = s.name and m.cohort = s.cohort::int);
`
}

async function main() {
  const source = process.argv[2]
  const html = source ? readFileSync(source, 'utf8') : await (await fetch(URL_DEFAULT)).text()
  const { members, problems } = parseMembers(html)
  if (members.length === 0) {
    console.error('명단을 하나도 읽지 못했습니다. 페이지 구조가 바뀌었는지 확인하세요.')
    process.exit(1)
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  mkdirSync(join(root, 'private'), { recursive: true })
  const out = join(root, 'private', 'members-import.sql')
  writeFileSync(out, toSql(members))

  // 이름은 화면에 찍지 않는다. 개수와 문제만 보여 준다.
  const byCohort = new Map()
  for (const m of members) byCohort.set(m.cohort, (byCohort.get(m.cohort) ?? 0) + 1)
  console.log(`읽은 사람: ${members.length}명, 기수: ${byCohort.size}개`)
  console.log([...byCohort].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${c}기 ${n}명`).join(', '))
  console.log(`회장·부회장 표시: ${members.filter((m) => m.role).length}명, 학번 있음: ${members.filter((m) => m.studentYear !== null).length}명`)
  if (problems.length) {
    console.log(`\n확인이 필요한 곳 ${problems.length}건:`)
    for (const p of problems) console.log(`  - ${p}`)
  }
  console.log(`\n만든 파일: ${out}`)
  console.log('이 파일을 열어 전체를 복사한 뒤 Supabase SQL 편집기에서 실행하세요.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
