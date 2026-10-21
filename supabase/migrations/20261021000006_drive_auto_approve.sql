-- GLIF 연명부: 학회 구글 드라이브 폴더를 공유받은 사람은 가입 신청 즉시 승인
--
-- 드라이브 폴더 관리 계정의 Apps Script(scripts/drive-sync/Code.gs)가 폴더의 편집자·뷰어 이메일을
-- sync_drive_access() 로 보내면 drive_access 표를 그 명단으로 맞춘다.
-- 가입 신청을 할 때 로그인 이메일이 명단에 있고 연명부에서 본인을 골랐으면 바로 승인한다.
-- 명단에 없거나 "목록에 없음"으로 신청하면 지금처럼 승인 대기로 남아 관리자가 승인한다.
-- 드라이브에서 빠져도 이미 승인된 계정은 그대로 둔다 (관리자가 정리한다).

create table public.drive_access (
  email text primary key,
  synced_at timestamptz not null default now(),
  constraint drive_access_email_lower check (email = lower(btrim(email)) and email like '%@%')
);

-- Apps Script 가 보내는 비밀 키의 sha256 값. 키 원문은 DB 에 두지 않는다.
-- 키는 SQL 편집기에서 직접 넣는다 (scripts/drive-sync/README.md 참고).
create table public.sync_keys (
  name text primary key,
  key_hash text not null
);

alter table public.drive_access enable row level security;
alter table public.sync_keys enable row level security;
revoke all on public.drive_access from anon, authenticated;
revoke all on public.sync_keys from anon, authenticated;
-- 관리자는 명단을 볼 수만 있다. 고치는 것은 동기화 함수만 한다
grant select on public.drive_access to authenticated;
create policy drive_access_admin_read on public.drive_access for select to authenticated using (public.is_admin());

-- 자동 승인된 계정인지 남겨 관리자가 따로 살펴볼 수 있게 한다. 앱 사용자는 꾸밀 수 없다(아래 트리거).
alter table public.accounts add column auto_approved boolean not null default false;

-- 대기 중인 신청 하나를 드라이브 명단으로 승인할 수 있으면 승인한다. 승인했으면 true.
-- security definer 로 accounts 를 바꾸면 guard_accounts 검사를 건너뛰므로 필요한 조건을 여기서 직접 본다:
-- 대기 상태, 학회원 역할, 연명부의 사람과 연결됨, 그 사람에게 승인된 다른 계정 없음, 확인된 이메일이 명단에 있음.
create function public.approve_from_drive(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  a public.accounts;
begin
  select * into a from public.accounts where user_id = p_user_id for update;
  if a.user_id is null or a.status <> '대기' or a.role <> '학회원' or a.member_id is null then
    return false;
  end if;
  if not exists (
    select 1 from auth.users u
    join public.drive_access d on d.email = lower(btrim(u.email))
    where u.id = p_user_id and u.email_confirmed_at is not null
  ) then
    return false;
  end if;
  if public.member_has_approved_account(a.member_id) then
    return false;
  end if;
  -- decided_at·decided_by 는 guard_accounts 가 채운다 (신청 때는 신청자, 동기화 때는 비어 있음).
  -- 누가 승인했는지보다 auto_approved 로 자동 승인임을 구분한다.
  update public.accounts
    set status = '승인', auto_approved = true, reject_reason = null
    where user_id = p_user_id;
  return true;
end $$;
revoke execute on function public.approve_from_drive(uuid) from public, anon, authenticated;

-- 가입 신청이 들어오면 바로 확인한다
create function public.accounts_auto_approve() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.approve_from_drive(new.user_id);
  return null;
end $$;
revoke execute on function public.accounts_auto_approve() from public, anon, authenticated;

create trigger accounts_auto_approve after insert on public.accounts
  for each row execute function public.accounts_auto_approve();

-- 앱 사용자는 auto_approved 를 직접 켜거나 끌 수 없다
create function public.accounts_keep_auto_approved() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    new.auto_approved := case when tg_op = 'INSERT' then false else old.auto_approved end;
  end if;
  return new;
end $$;
revoke execute on function public.accounts_keep_auto_approved() from public, anon, authenticated;

create trigger accounts_keep_auto_approved before insert or update on public.accounts
  for each row execute function public.accounts_keep_auto_approved();

-- Apps Script 가 부르는 동기화. 키가 맞으면 명단을 통째로 바꾸고, 명단에 새로 들어와
-- 승인할 수 있게 된 대기 신청도 승인한다. 돌려주는 값: 명단 수, 새로 승인한 수.
-- 빈 명단은 실수일 가능성이 커서 받지 않는다.
create function public.sync_drive_access(p_key text, p_emails text[])
returns table (emails int, approved int)
language plpgsql security definer set search_path = '' as $$
declare
  incoming text[];
  n_approved int := 0;
  r record;
begin
  if p_key is null or not exists (
    select 1 from public.sync_keys k
    where k.name = 'drive' and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception '동기화 키가 맞지 않습니다';
  end if;

  select array_agg(distinct lower(btrim(e))) into incoming
    from unnest(coalesce(p_emails, '{}')) e
    where btrim(coalesce(e, '')) like '%@%';
  if incoming is null then
    raise exception '빈 명단은 받지 않습니다';
  end if;

  delete from public.drive_access d where d.email <> all (incoming);
  insert into public.drive_access (email, synced_at)
    select e, now() from unnest(incoming) e
    on conflict (email) do update set synced_at = excluded.synced_at;

  for r in select a.user_id from public.accounts a where a.status = '대기' and a.member_id is not null order by a.requested_at loop
    if public.approve_from_drive(r.user_id) then
      n_approved := n_approved + 1;
    end if;
  end loop;

  return query select (select count(*)::int from public.drive_access), n_approved;
end $$;
revoke execute on function public.sync_drive_access(text, text[]) from public;
grant execute on function public.sync_drive_access(text, text[]) to anon, authenticated;
