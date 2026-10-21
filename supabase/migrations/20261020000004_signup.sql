-- GLIF 연명부: 가입 신청 화면 지원

-- 기수 선택지. 신청자는 settings 를 읽을 수 없으므로 security definer 로 현재 기수까지의 목록만 준다.
create function public.signup_cohorts() returns setof int
language sql stable security definer set search_path = '' as $$
  select generate_series(s.current_cohort, 1, -1) from public.settings s
$$;
revoke execute on function public.signup_cohorts() from public, anon;
grant execute on function public.signup_cohorts() to authenticated;

-- 승인하는 관리자가 신청자가 누구인지 알아볼 수 있게 로그인 계정의 이메일을 남긴다.
-- 신청자가 꾸며 넣지 못하도록 값은 트리거가 auth.users 에서 직접 채우고, 그 뒤로는 바꿀 수 없다.
alter table public.accounts add column email text;
update public.accounts a set email = u.email from auth.users u where u.id = a.user_id;

create function public.accounts_set_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.email := (select u.email from auth.users u where u.id = new.user_id);
  else
    new.email := old.email;
  end if;
  return new;
end $$;
-- 트리거 전용 함수라 직접 호출 권한은 아무에게도 주지 않는다
revoke execute on function public.accounts_set_email() from public, anon, authenticated;

create trigger accounts_email before insert or update on public.accounts
  for each row execute function public.accounts_set_email();
