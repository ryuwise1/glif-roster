# GLIF 연명부 (glif-roster)

GLIF 학회원 전용 연명부 웹사이트. 나중에 명함 도감과 한 서비스로 합친다.
설계 문서는 저장소 밖(본인 구글 드라이브)에 있고, 핵심 규칙은 아래에 모두 적는다.

## 답하는 말
- 사람에게 하는 답과 화면 문구는 한국어로 쓴다.

## 개인정보 (가장 중요)
- 원본 엑셀, CSV, 실제 학회원 이름·연락처는 커밋하지 않는다. `.gitignore`가 막지만 `git add -f`도 쓰지 않는다.
- 테스트와 예시에는 가짜 데이터만 쓴다 (`tests/db/fixtures.ts` 참고).
- 비밀값은 `.env.local`에만 둔다. 필요한 이름은 `.env.example`에 적는다.

## 영역과 담당
| 영역 | 폴더 | 담당 |
|---|---|---|
| 연명부 화면 | `app/(roster)/` | ryuwise1 |
| 도감 화면 | `app/(dex)/` | 김찬 |
| 공용 (DB, 로그인, 공통 부품) | `supabase/`, `lib/`, `components/` | 둘 다 — PR에서 상대 확인 필수 |
| 데이터 이전 | `scripts/import/` | ryuwise1 |

다른 사람 영역 파일은 고치지 않는다. 필요하면 PR 설명에 적고 상대에게 요청한다.

## 브랜치와 PR
- `main`에 직접 push하지 않는다. (비공개 개인 저장소라 GitHub가 막아 주지 않으므로 규칙으로 지킨다.)
- 브랜치 이름: `roster/…`, `dex/…`, `shared/…`
- PR을 열면 CI(린트·테스트·빌드)와 Vercel 미리보기가 돈다. 둘 다 통과해야 합친다.
- 공용 영역을 바꾼 PR은 상대가 확인한 뒤 합친다.

## DB 규칙
- DB 구조는 `supabase/migrations/`의 새 파일로만 바꾼다. 이미 원격에 적용된 마이그레이션 파일은 고치지 않는다.
- 파일 이름: `YYYYMMDDHHMMSS_설명.sql`
- 새 표에는 반드시 RLS를 켜고 정책을 만든다. 정책이 없으면 아무도 못 읽는 게 정상이다.
- 권한 규칙을 바꾸면 `tests/db/rls.test.ts`에 테스트를 추가한다.
- 권한 확인 함수: `is_approved()`, `is_admin()`, `is_superadmin()`, `current_member_id()`
- 학회원 열람은 `member_directory` 뷰로 한다 (숨긴 연락처가 가려짐). `members` 표를 직접 읽지 않는다.
- `accounts`를 security definer 함수(RPC) 안에서 바꾸면 `guard_accounts` 검사를 건너뛴다. 그런 함수는 같은 검사(관리자·최고관리자 보호, 결정 기록)를 직접 해야 한다.
- 새 표는 uuid 키를 쓴다. identity/serial 키를 쓰면 `authenticated`에 시퀀스 USAGE를 명시적으로 준다 (기본으로는 시퀀스 권한을 회수해 둠).
- 새 함수는 만든 직후 `revoke execute on function … from public, anon;`을 하고 필요한 사람에게만 `grant execute`한다. 빠뜨리면 '함수 실행 권한' 테스트가 실패한다.
- Supabase Security Advisor가 `member_directory`(security definer view)와 public의 security definer 함수를 경고하는 것은 의도된 설계다 (숨긴 연락처를 가리는 열람 경로).

## 명령
- 테스트: `npm test`
- 린트: `npm run lint`
- 빌드: `npm run build`
