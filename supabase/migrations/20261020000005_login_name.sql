-- GLIF 연명부: 승인 화면에 로그인 계정 이름 표시

-- 승인하는 관리자가 신청자가 고른 학회원 이름과 로그인 계정의 이름을 나란히 비교할 수 있게 남긴다.
-- 이메일과 같은 방식으로, 값은 트리거가 auth.users 에서 직접 채우고 그 뒤로는 바꿀 수 없다.
-- 구글·카카오 프로필 이름은 본인이 바꿀 수 있으므로 본인 확인 증거가 아니라 참고용이다.
alter table public.accounts add column login_name text;
update public.accounts a
  set login_name = nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), '')
  from auth.users u where u.id = a.user_id;

create function public.accounts_set_login_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.login_name := (
      select nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), '')
      from auth.users u where u.id = new.user_id
    );
  else
    new.login_name := old.login_name;
  end if;
  return new;
end $$;
-- 트리거 전용 함수라 직접 호출 권한은 아무에게도 주지 않는다
revoke execute on function public.accounts_set_login_name() from public, anon, authenticated;

create trigger accounts_login_name before insert or update on public.accounts
  for each row execute function public.accounts_set_login_name();
