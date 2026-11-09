-- 가입 코드 요청함 + 관리자.
-- - 누구나(로그인 안 해도) "코드 주세요" 요청을 남길 수 있음: jachul_request_code() 함수로만.
-- - 요청 표는 RLS 켜고 정책 없음 → 페이지에서 아무도 못 읽음. 관리자는 Edge Function(jachul-admin)으로만 봄.
-- - 스팸 막기: 같은 이메일은 대기 중 요청 1개만, 전체 대기 요청 100개 넘으면 안 받음, 글자 수 제한.

create table if not exists public.jachul_admins (
  email text primary key
);
alter table public.jachul_admins enable row level security;
revoke all on public.jachul_admins from anon, authenticated;
-- 관리자 이메일은 SQL로 직접 넣음 (깃에 안 남김): insert into public.jachul_admins values ('...');

create table if not exists public.jachul_code_requests (
  id bigint generated always as identity primary key,
  email text not null,
  name text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists jachul_code_requests_pending on public.jachul_code_requests (email) where done_at is null;
alter table public.jachul_code_requests enable row level security;
revoke all on public.jachul_code_requests from anon, authenticated;

create or replace function public.jachul_request_code(p_email text, p_name text, p_note text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  n text := trim(coalesce(p_name, ''));
  t text := left(trim(coalesce(p_note, '')), 200);
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 120 then return 'email'; end if;
  if length(n) < 1 or length(n) > 30 then return 'name'; end if;
  if exists (select 1 from public.jachul_code_requests where email = e and done_at is null) then return 'ok'; end if;
  if (select count(*) from public.jachul_code_requests where done_at is null) >= 100 then return 'full'; end if;
  insert into public.jachul_code_requests (email, name, note) values (e, n, t);
  return 'ok';
end;
$$;
revoke all on function public.jachul_request_code(text, text, text) from public;
grant execute on function public.jachul_request_code(text, text, text) to anon, authenticated;
