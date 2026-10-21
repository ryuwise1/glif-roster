# GLIF 연명부

GLIF 학회원 전용 연명부. Next.js + Supabase + Vercel.

## 처음 시작하기
1. 저장소 초대를 수락한다 (GitHub 알림 또는 이메일).
2. 받기:
   ```bash
   git clone https://github.com/ryuwise1/glif-roster.git
   cd glif-roster
   npm install
   ```
3. `.env.example`을 복사해 `.env.local`을 만들고, 값은 ryuwise1에게 받는다. 이 파일은 커밋되지 않는다.
4. 확인:
   ```bash
   npm test
   npm run dev
   ```
   브라우저에서 http://localhost:3000

## Claude Code로 작업하기
- 이 폴더를 Claude Code 작업 폴더로 연다. `CLAUDE.md`의 규칙을 Claude가 자동으로 따른다.
- 각자 자기 PC, 자기 계정으로 작업하고 GitHub PR로 합친다.

## 작업 순서
```bash
git switch main && git pull
git switch -c dex/카드-화면      # 도감은 dex/, 연명부는 roster/, 공용은 shared/
# 작업 후
git push -u origin dex/카드-화면
gh pr create --fill
```
PR에 Vercel 미리보기 주소가 달리면 서로 확인하고 합친다.

## 구글 로그인 설정 (한 번만, Supabase 프로젝트 만든 뒤)
1. Google Cloud Console > API 및 서비스 > 사용자 인증 정보에서 OAuth 클라이언트(웹 애플리케이션)를 만든다.
   승인된 리디렉션 URI에 Supabase가 알려 주는 콜백 주소(`https://<프로젝트>.supabase.co/auth/v1/callback`)를 넣는다.
2. Supabase 대시보드 > Authentication > Sign In / Providers > Google을 켜고 클라이언트 ID와 보안 비밀을 넣는다.
3. Supabase 대시보드 > Authentication > URL Configuration에서
   - Site URL: 배포 주소
   - Redirect URLs: `http://localhost:3000/**`, 배포 주소 `/**`, Vercel 미리보기 주소 패턴(`https://*-<팀>.vercel.app/**`)
4. 첫 최고관리자는 가입 신청·승인을 거친 뒤 Supabase SQL 편집기에서 지정한다 (`accounts.role = '최고관리자'`).

## 초대가 필요한 곳
- GitHub 저장소 (협업자)
- Supabase 조직 (Owner)
- Vercel은 무료 플랜이라 ryuwise1 계정만 대시보드를 쓴다. 배포와 미리보기는 PR만 올리면 자동으로 된다.
