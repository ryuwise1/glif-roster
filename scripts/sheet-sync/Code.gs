// GLIF 연명부: 'GLIF Network 서버' 시트의 연명부 탭과 사이트를 쌍방으로 맞춘다. 사이트가 기준이다.
//   사이트 → 시트: pullFromSite() 가 10분마다 연명부 탭의 학회원 줄을 사이트 내용으로 다시 쓴다
//   시트 → 사이트: 시트에서 칸을 고치면 onSheetEdit() 이 그 줄을 사이트에 반영한다
// 이 시트의 확장 프로그램 > Apps Script 에 붙여 넣는다. 설정 방법은 같은 폴더의 README.md 를 본다.
//
// 스크립트 속성(프로젝트 설정 > 스크립트 속성)에 넣을 값
//   SUPABASE_URL              https://<프로젝트>.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  Supabase 의 publishable 키 (sb_publishable_…)
//   SYNC_KEY                  SQL 편집기에서 만든 시트 동기화 키

const SHEET_NAME = '연명부'
const HEADER = ['학번', '기수', '성함', '직장명', '부서명', '연락처', '직급', '직무', '휴대폰', '개인 이메일', '구분', '학회원 ID', '경력 ID']
const COLS = HEADER.length // A~M. L·M 은 숨긴 ID 칸
const C = { year: 0, cohort: 1, name: 2, company: 3, team: 4, contact: 5, title: 6, job: 7, phone: 8, mail: 9, status: 10, memberId: 11, careerId: 12 }
const OUTSIDER = '비학회원'
const PAST_COLOR = '#b7b7b7'

function rpc_(name, body) {
  const props = PropertiesService.getScriptProperties()
  const url = props.getProperty('SUPABASE_URL')
  const apiKey = props.getProperty('SUPABASE_PUBLISHABLE_KEY')
  const syncKey = props.getProperty('SYNC_KEY')
  if (!url || !apiKey || !syncKey) throw new Error('스크립트 속성 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SYNC_KEY 를 먼저 넣어 주세요')
  const res = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: apiKey },
    payload: JSON.stringify(Object.assign({ p_key: syncKey }, body)),
    muteHttpExceptions: true,
  })
  const code = res.getResponseCode()
  if (code >= 300) throw new Error('사이트 연결 실패 (' + code + '): ' + res.getContentText())
  return JSON.parse(res.getContentText())
}

function sheet_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME)
  if (!sheet) throw new Error('"' + SHEET_NAME + '" 탭이 없습니다')
  return sheet
}

function readRows_(sheet) {
  const last = sheet.getLastRow()
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, COLS).getDisplayValues()
}

// 사이트 → 시트. 학회원 줄은 사이트 내용으로 통째로 바꾸고, 비학회원 줄은 있던 그대로 맨 아래에 둔다.
function pullFromSite() {
  const lock = LockService.getDocumentLock()
  if (!lock.tryLock(30000)) return
  try {
    const sheet = sheet_()
    const site = rpc_('sheet_export', {})
    const old = readRows_(sheet)
    const s = (v) => (v === null || v === undefined ? '' : String(v))
    const rows = site.map((r) => [
      s(r.student_year), s(r.cohort), s(r.name), s(r.company), s(r.team), s(r.contact),
      s(r.title), s(r.job_function), s(r.phone), s(r.personal_email), s(r.status), s(r.member_id), s(r.career_id),
    ]).concat(old.filter((r) => r[C.cohort] === OUTSIDER).map((r) => r.slice(0, C.memberId).concat(['', ''])))

    sheet.getRange(1, 1, 1, COLS).setValues([HEADER])
    sheet.getRange('A:A').setNumberFormat('@')
    sheet.getRange('I:I').setNumberFormat('@')
    sheet.hideColumns(C.memberId + 1, 2)

    const same = old.length === rows.length && old.every((r, i) => r.join('\t') === rows[i].join('\t'))
    if (!same && rows.length) sheet.getRange(2, 1, rows.length, COLS).setValues(rows)
    if (old.length > rows.length) sheet.getRange(rows.length + 2, 1, old.length - rows.length, COLS).clearContent()

    const height = Math.max(rows.length, old.length, 1)
    const colors = Array.from({ length: height }, (_, i) => {
      const color = rows[i] && rows[i][C.status] === '이전' ? PAST_COLOR : '#000000'
      return Array(C.status + 1).fill(color)
    })
    const body = sheet.getRange(2, 1, height, C.status + 1)
    body.setFontColors(colors)
    body.clearNote()
    console.log('사이트 → 시트: ' + site.length + '줄' + (same ? ' (바뀐 것 없음)' : ''))
  } finally {
    lock.releaseLock()
  }
}

// 시트 → 사이트. 설치형 '수정 시' 트리거로 돈다 (installTriggers).
function onSheetEdit(e) {
  const range = e && e.range
  if (!range || range.getSheet().getName() !== SHEET_NAME) return
  const first = Math.max(range.getRow(), 2)
  const end = range.getRow() + range.getNumRows() - 1
  if (end < first || range.getColumn() > C.status + 1) return // 숨긴 ID 칸만 고친 경우

  const sheet = range.getSheet()
  // 다른 실행이 줄을 다시 쓰기 전에 고친 값을 먼저 읽어 둔다
  const edited = sheet.getRange(first, 1, end - first + 1, COLS).getDisplayValues()
  const touched = (col) => range.getColumn() <= col + 1 && col + 1 <= range.getLastColumn()

  const lock = LockService.getDocumentLock()
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getActive().toast('다른 동기화가 돌고 있어 반영하지 못했습니다. 잠시 뒤 다시 고쳐 주세요', '연명부 동기화', 10)
    return
  }
  try {
    const payload = []
    edited.forEach((r, i) => {
      if (r[C.cohort] === OUTSIDER) return
      payload.push({
        row: first + i, member_id: r[C.memberId], career_id: r[C.careerId], cohort: r[C.cohort], name: r[C.name],
        student_year: r[C.year], company: r[C.company], team: r[C.team], title: r[C.title], job_function: r[C.job],
        phone: r[C.phone], personal_email: r[C.mail], status: r[C.status],
      })
    })
    if (!payload.length) return
    const result = rpc_('sheet_apply', { p_rows: payload })

    // 돌려받은 ID 를 숨긴 칸에 적는다. 그 사이 줄이 옮겨졌으면 (이름·직장명이 다르면) 적지 않는다.
    const sent = {}
    payload.forEach((p) => { sent[p.row] = p })
    result.rows.forEach((x) => {
      const now = sheet.getRange(x.row, 1, 1, COLS).getDisplayValues()[0]
      const p = sent[x.row]
      if (now[C.name] !== p.name || now[C.company] !== p.company) return
      sheet.getRange(x.row, C.memberId + 1, 1, 2).setValues([[x.member_id || '', x.career_id || '']])
      sheet.getRange(x.row, 1).clearNote()
    })
    result.problems.forEach((x) => sheet.getRange(x.row, 1).setNote('사이트에 반영되지 않음: ' + x.message))

    const notes = []
    if (result.problems.length) notes.push(result.problems.length + '줄은 사이트에 반영되지 않았습니다. 학번 칸의 메모를 보세요')
    if (edited.some((r) => r[C.memberId]) && (touched(C.cohort) || touched(C.name) || touched(C.contact))) {
      notes.push('기수·성함은 사이트에서 고칩니다. 연락처(F)는 휴대폰·개인 이메일에서 채워집니다. 10분 안에 사이트 값으로 돌아갑니다')
    }
    if (notes.length) SpreadsheetApp.getActive().toast(notes.join('\n'), '연명부 동기화', 15)
  } finally {
    lock.releaseLock()
  }
}

// 한 번만 실행한다. 10분마다 사이트 → 시트, 고칠 때마다 시트 → 사이트.
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter((t) => ['pullFromSite', 'onSheetEdit'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach((t) => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('pullFromSite').timeBased().everyMinutes(10).create()
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create()
}
