-- GLIF 연명부: 'GLIF Network 서버' 구글 시트와 쌍방 동기화
--
-- 시트에 붙인 Apps Script(scripts/sheet-sync/Code.gs)가 부른다. 사이트가 기준이다.
--   사이트 → 시트: sheet_export() 로 학회원 줄을 받아 연명부 탭을 다시 쓴다 (10분마다)
--   시트 → 사이트: 시트에서 고친 줄을 sheet_apply() 로 보낸다 (고칠 때마다)
-- 시트에서는 학번·휴대폰·개인 이메일과 경력(직장명·부서명·직급·직무·현직/이전)만 고친다.
-- 이름·기수·기수 역할은 지금처럼 사이트에서 관리자만 고친다. 경력 삭제도 사이트에서만 한다.
-- 키는 drive 와 같은 sync_keys 표에 name = 'sheet' 로 넣는다 (scripts/sheet-sync/README.md).

create function public.check_sync_key(p_name text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or not exists (
    select 1 from public.sync_keys k
    where k.name = p_name and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception '동기화 키가 맞지 않습니다';
  end if;
end $$;
revoke execute on function public.check_sync_key(text, text) from public, anon, authenticated;

-- 시트 한 줄 = 한 사람의 한 경력. 현직(구분 상관없이)을 먼저, 그다음 이전 정규직을 최근 순으로.
-- 경력이 없는 사람도 빈 줄 하나로 나온다. 정렬: 기수 → 회장·부회장 → 이름.
-- 본인이 사이트에서 숨긴 연락처는 '비공개'로 내보낸다 (sheet_apply 는 '비공개'를 받으면 그대로 둔다).
create function public.sheet_export(p_key text)
returns table (
  member_id uuid, career_id uuid, student_year text, cohort int, name text,
  company text, team text, contact text, title text, job_function text,
  phone text, personal_email text, status text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_sync_key('sheet', p_key);
  return query
  select m.id, c.id, lpad(m.student_year::text, 2, '0'), m.cohort, m.name,
         c.company, c.team, coalesce(v.phone, v.personal_email, v.work_email), c.title, c.job_function,
         case when m.phone is not null and v.phone is null then '비공개' else v.phone end,
         case when m.personal_email is not null and v.personal_email is null then '비공개' else v.personal_email end,
         case when c.id is null then null when c.is_current then '현직' else '이전' end
  from public.members m
  cross join lateral (select
    case when 'phone' = any(m.hidden_fields) then null else m.phone end as phone,
    case when 'personal_email' = any(m.hidden_fields) then null else m.personal_email end as personal_email,
    case when 'work_email' = any(m.hidden_fields) then null else m.work_email end as work_email) v
  left join public.careers c on c.member_id = m.id and (c.is_current or c.kind = '정규')
  order by m.cohort,
           case m.cohort_role when '회장' then 0 when '부회장' then 1 else 2 end,
           m.name, m.id,
           c.is_current desc nulls last,
           coalesce(c.ended_on, c.started_on) desc nulls last,
           c.company, c.id;
end $$;
revoke execute on function public.sheet_export(text) from public;
grant execute on function public.sheet_export(text) to anon, authenticated;

-- 시트에서 고친 줄들을 반영한다. p_rows: [{row, member_id, career_id, cohort, name, student_year,
-- company, team, title, job_function, phone, personal_email, status}] (값은 모두 글자, 빈칸은 '')
-- 줄마다 따로 처리해 한 줄이 틀려도 나머지는 들어간다. 값이 같으면 고치지 않는다(수정 기록이 안 남는다).
-- 학번·휴대폰·개인 이메일: ID 가 있는 줄은 빈칸이면 지운다. ID 없이 새로 적은 줄은 적은 칸만 바꾼다.
-- '비공개'는 그대로 둔다.
-- 돌려주는 값: {"rows": [{row, member_id, career_id}], "problems": [{row, message}]}
create function public.sheet_apply(p_key text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  done jsonb := '[]';
  problems jsonb := '[]';
  mid uuid;
  cid uuid;
  digits text;
  v_year int;
  v_phone text;
  v_mail text;
  v_company text;
  v_team text;
  v_title text;
  v_job text;
  v_status text;
  t text;
  by_name boolean;
  cur public.members;
begin
  perform public.check_sync_key('sheet', p_key);
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception '줄 목록이 아닙니다';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      -- 사람: 숨긴 ID 열이 있으면 그것으로, 없으면(새로 적은 줄) 기수+성함으로 찾는다
      mid := nullif(btrim(coalesce(r->>'member_id', '')), '')::uuid;
      by_name := mid is null;
      if by_name then
        select m.id into mid from public.members m
          where m.cohort::text = btrim(coalesce(r->>'cohort', '')) and m.name = btrim(coalesce(r->>'name', ''));
        if mid is null then
          -- 아직 적는 중인 빈 줄은 조용히 넘긴다
          if btrim(coalesce(r->>'company', '')) <> '' then
            raise exception '사이트에 없는 사람입니다. 사람은 사이트에서 먼저 추가해 주세요';
          end if;
          continue;
        end if;
      elsif not exists (select 1 from public.members m where m.id = mid) then
        raise exception '사이트에 없는 사람입니다';
      end if;

      -- 학번·휴대폰·개인 이메일
      select * into cur from public.members m where m.id = mid;
      t := btrim(coalesce(r->>'student_year', ''));
      if t = '' then v_year := case when by_name then cur.student_year end;
      elsif t ~ '^[0-9]{1,2}$' then v_year := t::int;
      else raise exception '학번은 두 자리 숫자로 적어 주세요 (예: 21)';
      end if;
      t := btrim(coalesce(r->>'phone', ''));
      digits := regexp_replace(t, '[^0-9]', '', 'g');
      if t = '비공개' then v_phone := cur.phone;
      elsif t = '' then v_phone := case when by_name then cur.phone end;
      elsif digits ~ '^010[0-9]{8}$' then v_phone := substr(digits, 1, 3) || '-' || substr(digits, 4, 4) || '-' || substr(digits, 8, 4);
      else raise exception '휴대폰은 010-0000-0000 꼴로 적어 주세요';
      end if;
      t := btrim(coalesce(r->>'personal_email', ''));
      if t = '비공개' then v_mail := cur.personal_email;
      elsif t = '' then v_mail := case when by_name then cur.personal_email end;
      elsif t ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v_mail := t;
      else raise exception '개인 이메일 모양이 맞지 않습니다';
      end if;
      update public.members m
        set student_year = v_year, phone = v_phone, personal_email = v_mail
        where m.id = mid
          and (m.student_year, m.phone, m.personal_email) is distinct from (v_year, v_phone, v_mail);

      -- 경력
      cid := nullif(btrim(coalesce(r->>'career_id', '')), '')::uuid;
      v_company := nullif(btrim(coalesce(r->>'company', '')), '');
      v_team := nullif(btrim(coalesce(r->>'team', '')), '');
      v_title := nullif(btrim(coalesce(r->>'title', '')), '');
      v_job := nullif(btrim(coalesce(r->>'job_function', '')), '');
      v_status := btrim(coalesce(r->>'status', ''));
      if v_status not in ('', '현직', '이전') then
        raise exception '구분은 현직 또는 이전으로 적어 주세요';
      end if;
      if v_job is not null and not exists (select 1 from public.job_functions j where j.name = v_job) then
        raise exception '직무 "%" 는 목록에 없습니다. 목록: %', v_job,
          (select string_agg(j.name, ', ' order by j.sort) from public.job_functions j);
      end if;

      if cid is not null then
        if not exists (select 1 from public.careers c where c.id = cid and c.member_id = mid) then
          raise exception '이 줄의 경력을 찾지 못했습니다. 사이트에서 지워졌을 수 있습니다';
        end if;
        if v_company is null then
          raise exception '직장명을 비울 수 없습니다. 경력을 지우려면 사이트에서 지워 주세요';
        end if;
        update public.careers c
          set company = v_company, team = v_team, title = v_title, job_function = v_job,
              is_current = case v_status when '현직' then true when '이전' then false else c.is_current end
          where c.id = cid
            and (c.company, c.team, c.title, c.job_function, c.is_current)
                is distinct from (v_company, v_team, v_title, v_job,
                                  case v_status when '현직' then true when '이전' then false else c.is_current end);
      elsif v_company is not null then
        insert into public.careers (member_id, kind, is_current, company, team, title, job_function)
          values (mid, '정규', v_status <> '이전', v_company, v_team, v_title, v_job)
          returning id into cid;
      end if;

      done := done || jsonb_build_object('row', r->'row', 'member_id', mid, 'career_id', cid);
    exception
      when invalid_text_representation then
        problems := problems || jsonb_build_object('row', r->'row', 'message', '숨긴 ID 칸(L·M열) 값이 망가졌습니다');
      when others then
        problems := problems || jsonb_build_object('row', r->'row', 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('rows', done, 'problems', problems);
end $$;
revoke execute on function public.sheet_apply(text, jsonb) from public;
grant execute on function public.sheet_apply(text, jsonb) to anon, authenticated;
