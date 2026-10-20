# 연명부 화면(UI) 연결 안내서

연명부 화면을 새로 만들거나 교체하는 사람(과 그 사람의 Claude)을 위한 문서다.
**DB 구조, 권한 규칙(RLS), 로그인·가입·승인 흐름, 자료 이전은 이미 끝나 있다.** 화면은 그 위에 올리면 된다.
권한은 화면이 아니라 DB가 지킨다. 화면 코드가 실수해도 개인정보가 새지 않게 만들어 둔 것이니, 아래 규칙을 우회하지 않는다.

## 1. 한눈에
- 스택: Next.js 16 (App Router) + Supabase(Postgres, Auth, RLS) + Vercel
- 화면 폴더: `app/(roster)/` (연명부 화면 담당). 도감은 `app/(dex)/`
- 그대로 두는 것: `supabase/`, `lib/supabase/`, `lib/auth.ts`, `proxy.ts`, `app/auth/callback/route.ts`
- 바꿔도 되는 것: `app/(roster)/` 안의 화면과 `components/shell.tsx`
- 환경변수 (`.env.local`, 배포는 Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - publishable 키만 쓴다. **secret(service_role) 키는 화면 코드에 절대 넣지 않는다.** 넣으면 RLS 가 무력화된다.

## 2. 로그인 상태와 화면 이동
`lib/auth.ts` 의 `getAccess()` 가 지금 사용자의 상태를 돌려준다.

| 상태 | 뜻 | 보내는 곳 (`homeFor`) |
|---|---|---|
| `anon` | 로그인 안 함 | `/login` |
| `unregistered` | 구글 로그인만 했고 가입 신청 전 | `/signup` |
| `registered` + `대기` / `거절` | 신청함, 관리자 결정 전 / 거절됨 | `/pending` |
| `registered` + `승인` | 연명부를 볼 수 있음 | `/members` |

- 페이지 맨 위에서 `requireApproved()`, `requireAdmin()`, `requireUnregistered()`, `requireWaiting()` 를 부르면 상태가 맞지 않을 때 알아서 보낸다.
- 경로를 바꾸면 `homeFor` 와 `proxy.ts`(`lib/supabase/session.ts` 의 `PUBLIC_PATHS`) 를 같이 고친다.
- 구글 로그인 시작은 `app/(roster)/actions.ts` 의 `signInWithGoogle`, 돌아오는 곳은 `app/auth/callback/route.ts`.

## 3. 읽기: 어디서 무엇을 읽나
모두 `createClient()` (`lib/supabase/server.ts`) 로 만든 **로그인한 사용자 권한**의 클라이언트로 읽는다.

| 필요한 것 | 읽는 곳 | 비고 |
|---|---|---|
| 학회원 목록·상세 | **`member_directory` 뷰** | 본인이 숨긴 연락처(phone, personal_email, work_email)는 `null` 로 가려서 준다. **`members` 표를 직접 읽지 않는다** (관리자·본인 외에는 막혀 있다) |
| 경력 | `careers` 표 (`member_id` 로 묶음) | 승인된 사람만 읽을 수 있다 |
| 업종·직무 선택지 | `industries`, `job_functions` | `sort` 순 |
| 가입 신청 화면의 기수 목록 | RPC `signup_cohorts()` | 현재 기수부터 1까지 |
| 가입 신청 화면의 이름 목록 | RPC `signup_candidates(p_cohort)` | 아직 계정이 연결되지 않은 사람의 `id`, `name` 만 준다 |
| 내 계정 상태 | `accounts` (본인 행) | 관리자는 전체 행. 신청자 이메일은 `accounts.email` |
| 설정 | `settings` | 승인된 사람만 |

- `member_directory` 열: `id, name, cohort, cohort_role, department, student_year, phone, personal_email, work_email, updated_at`
- `cohort_role` 은 `'회장' | '부회장' | null`. 목록에서 기수별로 표시한다.
- 한 번에 1000행까지만 돌려준다. 더 많이 읽을 때는 `.range()` 로 나눠 읽는다 (`lib/roster-data.ts` 참고).

## 4. 쓰기
| 하는 일 | 방법 | 누가 |
|---|---|---|
| 가입 신청 | `accounts` insert: `user_id`(본인), `member_id`(고른 사람) **또는** `claimed_name`+`claimed_cohort`("목록에 없음") | 로그인한 누구나 |
| 승인 | `accounts` update `status = '승인'` (`member_id` 가 있어야 함) | 관리자 |
| 거절 | `accounts` update `status = '거절'`, `reject_reason` | 관리자 |
| 학회원·경력 추가·수정·삭제 | `members`, `careers` | 관리자 |
| 관리자 지정·해제 | `accounts.role` | 관리자 (다른 관리자는 최고관리자만 바꿀 수 있다) |

- 결정 기록(`decided_at`, `decided_by`)과 `accounts.email` 은 DB 가 채운다. 화면에서 넣어도 무시된다.
- DB 오류 메시지는 한국어로 이유가 적혀 있는 것이 많다 (예: "마지막 최고 관리자 계정은 강등하거나 거절할 수 없습니다"). 화면에 그대로 보여 줘도 좋다.
- 승인·거절·삭제 같은 쓰기는 서버 액션에서 한다. 화면에서 숨기는 것만으로는 보호가 안 되고, DB 가 최종으로 막는다.

## 5. 지켜야 할 것
1. **권한을 우회하지 않는다.** service_role 키 사용, RLS 끄기, 정책 수정, `members` 직접 읽기를 하지 않는다. 필요한 읽기·쓰기가 막혀 있으면 화면을 고치지 말고 DB 규칙(마이그레이션) 변경이 필요한 것으로 보고 상의한다.
2. **개인정보를 커밋하지 않는다.** 실제 이름·연락처, 엑셀·CSV, `.env.local` 은 올리지 않는다. 예시와 테스트에는 가짜 데이터만 쓴다.
3. **DB 구조는 `supabase/migrations/` 의 새 파일로만 바꾼다.** 새 표에는 RLS, 새 함수에는 `revoke execute … from public, anon`. 자세한 규칙은 `CLAUDE.md`.
4. 브랜치는 `roster/…`, PR 로 합친다. `main` 에 직접 올리지 않는다.
5. 화면 문구는 한국어.

## 6. Next.js 16 주의
이 저장소의 Next 는 학습된 지식과 다른 점이 있다. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 안내를 읽는다 (`AGENTS.md` 참고).
- 미들웨어는 `proxy.ts` 로 이름이 바뀌었다.
- `cacheComponents` 가 켜져 있어서 `cookies()`, `searchParams`, `params` 를 읽는 컴포넌트는 `<Suspense>` 안에 둔다 (`app/(roster)/login/page.tsx` 참고).
- `PageProps<'/경로'>` 같은 타입은 `npx next typegen` 이나 빌드 뒤에 생긴다.

## 7. 정적 HTML 화면이면
화면이 Next 가 아니라 정적 HTML/JS 라면, 두 가지 중 하나로 한다.
- **권장**: 이 앱 안으로 옮긴다. HTML/CSS 를 `app/(roster)/` 의 컴포넌트로 바꾸고, 로그인·승인은 위의 `lib/auth.ts` 를 그대로 쓴다.
- 브라우저에서 `@supabase/supabase-js` 로 직접 호출하는 방식도 같은 권한 규칙이 적용된다. 이때도 publishable 키만 쓰고, 구글 로그인 후 돌아올 주소를 Supabase 의 Redirect URLs 에 추가해야 한다.

## 8. 로컬에서 돌려 보기
```bash
npm install
cp .env.example .env.local   # 값은 ryuwise1 에게
npm run dev                  # http://localhost:3000
npm test                     # DB 권한 규칙·가져오기 테스트 (Supabase 없이 PGlite 로 돌아간다)
npm run lint && npm run build
```
