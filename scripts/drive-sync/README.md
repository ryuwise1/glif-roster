# 드라이브 공유 명단으로 자동 승인

학회 구글 드라이브 폴더를 공유받은 사람이 연명부에 가입 신청을 하면, 관리자 승인 없이 바로 승인됩니다.

## 동작

- 승인되는 경우: 로그인한 구글 계정 이메일이 폴더 공유 명단에 있고, 가입 신청에서 연명부의 본인 이름을 골랐을 때
- 지금처럼 대기로 가는 경우
  - 명단에 없을 때
  - "목록에 없음"으로 신청했을 때
  - 이메일이 확인되지 않은 계정일 때
- 명단에 나중에 들어온 대기자는 다음 동기화 때 승인됩니다.
- 드라이브에서 빠져도 이미 승인된 계정은 그대로 둡니다. 정리는 관리자가 합니다.
- 자동 승인된 계정은 가입 승인 화면 아래 "드라이브 명단으로 자동 승인"에 보입니다.

## 한계

- 폴더에 사람별로 공유한 이메일만 잡힙니다.
  - "링크가 있는 모든 사용자" 공유는 잡히지 않습니다.
  - 구글 그룹으로 공유한 경우에는 그룹 주소만 잡힙니다.
- 하위 폴더나 파일에만 따로 공유한 사람은 잡히지 않습니다.
- 연명부에 카카오로 로그인하면 이메일이 드라이브 공유 이메일과 다를 수 있습니다.

## 설정 (한 번만)

1. **DB 마이그레이션 적용**: `supabase/migrations/20261021000006_drive_auto_approve.sql`
2. **동기화 키 만들기**
   - Supabase SQL 편집기에서 아래를 실행합니다.
   - 결과로 나온 `sync_key` 값을 복사해 둡니다. DB에는 이 값의 해시만 남습니다.
   - 다시 실행하면 키가 새로 바뀝니다. 그때는 Apps Script 속성도 바꿔야 합니다.
   ```sql
   with k as (select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as key)
   insert into public.sync_keys (name, key_hash) select 'drive', encode(sha256(convert_to(key, 'UTF8')), 'hex') from k
   on conflict (name) do update set key_hash = excluded.key_hash
   returning (select key from k) as sync_key;
   ```
3. **Apps Script 만들기**
   - 폴더의 공유 목록을 볼 수 있는 계정(폴더 소유자나 편집자)으로 https://script.google.com 에서 새 프로젝트를 만듭니다.
   - `Code.gs` 내용을 붙여 넣습니다.
4. **스크립트 속성 넣기** (프로젝트 설정 → 스크립트 속성)
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SYNC_KEY`: 2단계에서 복사한 값
5. **실행하기**
   - 편집기에서 `syncDriveAccess`를 한 번 실행합니다. 권한을 허용하고, 실행 기록에 "동기화 완료"가 나오는지 봅니다.
   - 이어서 `installDailyTrigger`를 한 번 실행합니다. 이후 매일 새벽 4시쯤 자동으로 돕니다.

## 키를 바꾸거나 끄려면

- **키 바꾸기**: 2단계를 다시 실행하고, 4단계의 `SYNC_KEY`를 새 값으로 바꿉니다.
- **자동 승인 끄기**
  ```sql
  delete from public.sync_keys where name = 'drive';
  delete from public.drive_access;
  ```
  이러면 새 신청은 모두 대기로 갑니다.
