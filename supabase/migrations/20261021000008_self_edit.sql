-- GLIF 연명부: 내 정보 수정
-- 승인된 학회원은 자기 연락처·학과·학번·숨김 항목과 자기 경력을 바로 고칠 수 있다.
-- 이름·기수·기수 역할은 사람을 구분하는 값이라 관리자만 고친다. 고친 내용은 수정 기록(0003)에 남는다.

-- current_member_id() 는 승인된 계정의 학회원만 돌려주므로 대기·거절 계정은 아무 행도 고칠 수 없다
create policy members_self_update on public.members for update to authenticated
  using (id = public.current_member_id()) with check (id = public.current_member_id());

create policy careers_self_insert on public.careers for insert to authenticated
  with check (member_id = public.current_member_id());
create policy careers_self_update on public.careers for update to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy careers_self_delete on public.careers for delete to authenticated
  using (member_id = public.current_member_id());

-- RLS 는 열을 가리지 못하므로 트리거로 막는다.
-- 로그인한 사람(auth.uid() 가 있음)만 검사한다. SQL 편집기에서 직접 고치는 것은 막지 않는다.
create function public.guard_member_self() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
    new.name is distinct from old.name
    or new.cohort is distinct from old.cohort
    or new.cohort_role is distinct from old.cohort_role
  ) then
    raise exception '이름·기수·기수 역할은 관리자만 고칠 수 있습니다';
  end if;
  return new;
end $$;
revoke execute on function public.guard_member_self() from public, anon, authenticated;

create trigger members_guard_self before update on public.members
  for each row execute function public.guard_member_self();
