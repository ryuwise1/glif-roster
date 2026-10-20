// 로그인 계정 이름과 연명부 이름이 같은지 본다. 띄어쓰기는 무시하고,
// 구글 이름이 "길동 홍"처럼 이름·성 순서로 적힌 경우도 같은 사람으로 본다.
// 프로필 이름은 본인이 바꿀 수 있으므로 승인 편의를 위한 참고 표시일 뿐이다.
export function nameMatches(loginName: string | null, memberName: string | null): boolean {
  if (!loginName || !memberName) return false
  const target = memberName.replace(/\s+/g, '')
  if (!target) return false
  const parts = loginName.trim().split(/\s+/)
  if (parts.join('') === target) return true
  return parts.length === 2 && parts[1] + parts[0] === target
}
