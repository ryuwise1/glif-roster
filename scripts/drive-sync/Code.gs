// GLIF 연명부: 학회 드라이브 폴더 공유 명단을 연명부 자동 승인 명단으로 보낸다.
// 이 폴더의 공유 목록을 볼 수 있는 구글 계정(폴더 소유자나 편집자)의 Apps Script 에 붙여 넣는다.
// 설정 방법은 같은 폴더의 README.md 를 본다.
//
// 스크립트 속성(프로젝트 설정 > 스크립트 속성)에 넣을 값
//   SUPABASE_URL              https://<프로젝트>.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  Supabase 의 publishable 키 (sb_publishable_…)
//   SYNC_KEY                  SQL 편집기에서 만든 동기화 키

const FOLDER_ID = '1XpP1S03apTmdNed6ZuTbOvCWwguUod1O'

function syncDriveAccess() {
  const props = PropertiesService.getScriptProperties()
  const url = props.getProperty('SUPABASE_URL')
  const apiKey = props.getProperty('SUPABASE_PUBLISHABLE_KEY')
  const syncKey = props.getProperty('SYNC_KEY')
  if (!url || !apiKey || !syncKey) throw new Error('스크립트 속성 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SYNC_KEY 를 먼저 넣어 주세요')

  const folder = DriveApp.getFolderById(FOLDER_ID)
  const people = [folder.getOwner()].concat(folder.getEditors(), folder.getViewers())
  const emails = Array.from(new Set(
    people.filter(Boolean).map((u) => (u.getEmail() || '').trim().toLowerCase()).filter((e) => e.indexOf('@') > 0),
  ))
  if (emails.length === 0) throw new Error('폴더 공유 명단이 비어 있습니다. 링크 공유만 켜져 있으면 사람별 이메일이 나오지 않습니다')

  const res = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/sync_drive_access', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: apiKey },
    payload: JSON.stringify({ p_key: syncKey, p_emails: emails }),
    muteHttpExceptions: true,
  })
  const code = res.getResponseCode()
  if (code >= 300) throw new Error('동기화 실패 (' + code + '): ' + res.getContentText())
  // 이메일은 기록에 남기지 않고 수만 남긴다
  console.log('동기화 완료: ' + res.getContentText())
}

// 한 번만 실행한다. 이후 매일 새벽 동기화가 돈다.
function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncDriveAccess')
    .forEach((t) => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('syncDriveAccess').timeBased().everyDays(1).atHour(4).create()
}
