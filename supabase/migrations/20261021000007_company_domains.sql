-- GLIF 연명부: 회사 로고용 도메인
-- 경력의 회사 이름마다 관리자가 도메인을 정해 두면 상세 화면에 그 회사 로고가 보인다.
-- 이름은 화면에서 공백·대소문자·(주) 등을 무시하고 맞춘다(lib/companies.ts).

create table public.company_domains (
  company text primary key check (length(trim(company)) > 0),
  domain text not null check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger company_domains_touch before insert or update on public.company_domains
  for each row execute function public.touch_updated();

alter table public.company_domains enable row level security;
revoke all on public.company_domains from anon;
revoke truncate, references, trigger on public.company_domains from authenticated;

create policy company_domains_read on public.company_domains for select to authenticated using (public.is_approved());
create policy company_domains_admin on public.company_domains for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
