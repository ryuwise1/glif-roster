-- GLIF 연명부: 권한 규칙

-- 앞으로 만드는 표·시퀀스·함수가 로그인하지 않은 사람에게 자동으로 열리지 않게 한다
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
-- 로그인한 사람에게도 표 비우기(TRUNCATE)·참조·트리거 권한은 주지 않는다. TRUNCATE 는 RLS 와 행 트리거를 건너뛴다.
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 권한 확인 함수 (RLS 정책 안에서 accounts를 다시 읽으므로 security definer)
create function public.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.accounts where user_id = auth.uid() and status = '승인')
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts
    where user_id = auth.uid() and status = '승인' and role in ('관리자', '최고관리자')
  )
$$;

create function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts
    where user_id = auth.uid() and status = '승인' and role = '최고관리자'
  )
$$;

create function public.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select member_id from public.accounts where user_id = auth.uid() and status = '승인'
$$;

-- 로그인하지 않은 사람은 표에 손대지 못한다
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- RLS 켜기
alter table public.settings enable row level security;
alter table public.industries enable row level security;
alter table public.job_functions enable row level security;
alter table public.members enable row level security;
alter table public.careers enable row level security;
alter table public.accounts enable row level security;

-- settings
create policy settings_read on public.settings for select to authenticated using (public.is_approved());
create policy settings_admin on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 업종·직무 목록
create policy industries_read on public.industries for select to authenticated using (public.is_approved());
create policy industries_admin on public.industries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy job_functions_read on public.job_functions for select to authenticated using (public.is_approved());
create policy job_functions_admin on public.job_functions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- members: 직접 읽기는 본인과 관리자만. 학회원 열람은 member_directory 뷰로 한다.
create policy members_read on public.members for select to authenticated
  using (public.is_admin() or id = public.current_member_id());
create policy members_admin_insert on public.members for insert to authenticated
  with check (public.is_admin());
create policy members_admin_update on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy members_admin_delete on public.members for delete to authenticated
  using (public.is_admin());

-- careers
create policy careers_read on public.careers for select to authenticated using (public.is_approved());
create policy careers_admin_insert on public.careers for insert to authenticated
  with check (public.is_admin());
create policy careers_admin_update on public.careers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy careers_admin_delete on public.careers for delete to authenticated
  using (public.is_admin());

-- accounts
create policy accounts_read on public.accounts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy accounts_signup on public.accounts for insert to authenticated
  with check (user_id = auth.uid() and status = '대기' and role = '학회원');
create policy accounts_admin_update on public.accounts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy accounts_admin_delete on public.accounts for delete to authenticated
  using (public.is_admin());

-- 최고관리자 보호와 결정 기록
-- SQL 편집기(postgres)에서 처음 최고관리자를 지정할 수 있도록, 검사는 앱 사용자(authenticated)에게만 한다.
create function public.guard_accounts() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if current_user = 'authenticated' and old.role = '최고관리자' and not public.is_superadmin() then
      raise exception '최고 관리자 계정은 최고 관리자만 삭제할 수 있습니다';
    end if;
    return old;
  end if;

  if current_user = 'authenticated' then
    if not public.is_superadmin() then
      if new.role = '최고관리자' and (tg_op = 'INSERT' or old.role is distinct from '최고관리자') then
        raise exception '최고 관리자만 최고 관리자를 지정할 수 있습니다';
      end if;
      if tg_op = 'UPDATE' and old.role = '최고관리자' then
        raise exception '최고 관리자 계정은 최고 관리자만 바꿀 수 있습니다';
      end if;
    end if;
    -- 가입 신청 때 결정 기록을 미리 채워 넣을 수 없다
    if tg_op = 'INSERT' then
      new.decided_at := null;
      new.decided_by := null;
      new.reject_reason := null;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;
  return new;
end $$;

create trigger accounts_guard before insert or update or delete on public.accounts
  for each row execute function public.guard_accounts();

-- 학회원 열람용 뷰: 소유자 권한으로 members를 읽고, 승인 여부와 숨김 항목을 스스로 거른다.
create view public.member_directory as
select
  m.id,
  m.name,
  m.cohort,
  m.cohort_role,
  m.department,
  m.student_year,
  case when 'phone' = any (m.hidden_fields)
        and not (public.is_admin() or m.id = public.current_member_id())
       then null else m.phone end as phone,
  case when 'personal_email' = any (m.hidden_fields)
        and not (public.is_admin() or m.id = public.current_member_id())
       then null else m.personal_email end as personal_email,
  case when 'work_email' = any (m.hidden_fields)
        and not (public.is_admin() or m.id = public.current_member_id())
       then null else m.work_email end as work_email,
  m.updated_at
from public.members m
where public.is_approved();

-- 뷰는 소유자 권한으로 members를 읽으므로 쓰기 권한이 남아 있으면 RLS를 우회한다. 읽기만 허용한다.
revoke all on public.member_directory from public, anon, authenticated;
grant select on public.member_directory to authenticated;

-- 가입 신청 화면용: 기수별로 아직 연결되지 않은 사람의 이름만 돌려준다 (연락처는 주지 않음)
create function public.signup_candidates(p_cohort int)
returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name
  from public.members m
  where m.cohort = p_cohort
    and not exists (
      select 1 from public.accounts a where a.member_id = m.id and a.status = '승인'
    )
  order by m.name
$$;

revoke execute on function public.signup_candidates(int) from public, anon;
grant execute on function public.signup_candidates(int) to authenticated;
