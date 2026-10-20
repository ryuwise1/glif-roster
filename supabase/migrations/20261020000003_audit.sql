-- GLIF 연명부: 수정 기록

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb
);

-- 읽기는 관리자만, 쓰기는 아래 트리거(소유자 권한)만 한다
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());

create function public.write_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
begin
  if tg_table_name = 'accounts' then
    rid := coalesce(new.user_id, old.user_id);
  else
    rid := coalesce(new.id, old.id);
  end if;
  insert into public.audit_log (actor, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    rid,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null; -- after 트리거라 반환값은 쓰이지 않는다
end $$;

-- 트리거 전용 함수라 직접 호출 권한은 아무에게도 주지 않는다
-- 번호표(시퀀스)는 소유자 권한의 트리거만 쓴다
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated;

revoke execute on function public.write_audit() from public, anon, authenticated;

create trigger members_audit after insert or update or delete on public.members
  for each row execute function public.write_audit();
create trigger careers_audit after insert or update or delete on public.careers
  for each row execute function public.write_audit();
create trigger accounts_audit after insert or update or delete on public.accounts
  for each row execute function public.write_audit();
