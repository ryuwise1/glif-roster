-- GLIF 연명부: 표와 제약

create type public.cohort_role as enum ('회장', '부회장');
create type public.career_kind as enum ('정규', '인턴', '학업');
create type public.account_status as enum ('대기', '승인', '거절');
create type public.account_role as enum ('학회원', '관리자', '최고관리자');

-- 설정 (한 행만 존재)
create table public.settings (
  id boolean primary key default true check (id),
  current_cohort int not null check (current_cohort between 1 and 100),
  self_edit_enabled boolean not null default false
);
insert into public.settings (current_cohort) values (20);

-- 업종·직무 목록 (설문 결과를 받으면 새 마이그레이션으로 교체)
create table public.industries (name text primary key, sort int not null default 0);
create table public.job_functions (name text primary key, sort int not null default 0);
insert into public.industries (name, sort) values
  ('금융', 1), ('회계', 2), ('컨설팅', 3), ('공공', 4), ('IT', 5), ('제조', 6), ('기타', 99);
insert into public.job_functions (name, sort) values
  ('주식', 1), ('채권', 2), ('S&T', 3), ('IB/PE', 4), ('리서치', 5), ('운용', 6),
  ('영업', 7), ('재무', 8), ('기타', 99);

-- 공통: 수정 시각과 수정자
create function public.touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- 사람
create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  cohort int not null check (cohort >= 1),
  cohort_role public.cohort_role,
  department text,
  student_year int check (student_year between 0 and 99),
  phone text check (phone ~ '^010-[0-9]{4}-[0-9]{4}$'),
  personal_email text check (personal_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  work_email text check (work_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  hidden_fields text[] not null default '{}'
    check (hidden_fields <@ array['phone', 'personal_email', 'work_email']::text[]),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index members_cohort_idx on public.members (cohort);

create function public.check_cohort() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_cohort int := (select current_cohort from public.settings);
begin
  if new.cohort > max_cohort then
    raise exception '기수는 현재 기수(%)보다 클 수 없습니다', max_cohort;
  end if;
  return new;
end $$;

create trigger members_check_cohort before insert or update of cohort on public.members
  for each row execute function public.check_cohort();
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated();

-- 경력 (현직·전 직장·인턴·학업)
create table public.careers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind public.career_kind not null default '정규',
  is_current boolean not null default false,
  industry text references public.industries (name) on update cascade,
  job_function text references public.job_functions (name) on update cascade,
  company text not null check (length(trim(company)) > 0),
  team text,
  title text,
  region text,
  started_on date,
  ended_on date,
  check (ended_on is null or started_on is null or ended_on >= started_on),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index careers_member_idx on public.careers (member_id);

create trigger careers_touch before update on public.careers
  for each row execute function public.touch_updated();

-- 계정 연결 (로그인 계정 ↔ 사람)
create table public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  claimed_name text,
  claimed_cohort int,
  status public.account_status not null default '대기',
  role public.account_role not null default '학회원',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  reject_reason text,
  check (member_id is not null or (claimed_name is not null and claimed_cohort is not null)),
  check (status <> '승인' or member_id is not null)
);
create unique index accounts_one_approved_per_member
  on public.accounts (member_id) where status = '승인';
