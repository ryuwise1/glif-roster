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

## 초대가 필요한 곳
- GitHub 저장소 (협업자)
- Supabase 조직 (Owner)
- Vercel은 무료 플랜이라 ryuwise1 계정만 대시보드를 쓴다. 배포와 미리보기는 PR만 올리면 자동으로 된다.
