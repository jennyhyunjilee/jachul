-- 쟈철 앱 안에서 처음 비밀번호 정하기 (메일 링크 없이).
-- 회원마다 1회용 "가입 코드"를 주고, 이메일 + 가입 코드가 맞을 때만 비밀번호를 정할 수 있게 한다.
--
-- 보안:
-- - 이 표엔 이메일도 코드도 그대로 안 둔다. sha256(이메일), sha256(소금+코드)만 저장.
--   진짜 코드는 tools/make_invites.py가 만든 가입코드_명부.txt(깃·배포 제외)에만 있다.
-- - 표는 RLS 켜고 정책 없음 → 페이지(anon/로그인 사용자)는 아예 못 읽고 못 씀. 아래 함수로만 씀.
-- - 코드는 한 번 쓰면 끝. 5번 틀리면 그 이메일은 잠김(관리자가 새 코드 발급해야 함).
-- - 어떤 이유로 실패해도 같은 말만 돌려줌 → 누가 명부에 있는지 떠볼 수 없음.
-- - 비밀번호는 Supabase Auth와 같은 bcrypt로만 저장. 평문은 어디에도 안 남음.

create table if not exists public.jachul_invites (
  email_sha text primary key,            -- sha256(lower(trim(email)))
  salt text not null,
  code_hash text not null,               -- sha256(salt || upper(code))
  fails int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.jachul_invites enable row level security;
revoke all on public.jachul_invites from anon, authenticated;

create or replace function public.jachul_set_password(p_email text, p_code text, p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv public.jachul_invites%rowtype;
  n int;
begin
  if length(coalesce(p_password, '')) < 8 or length(p_password) > 72 then
    return 'weak';
  end if;
  select * into inv from public.jachul_invites
    where email_sha = encode(extensions.digest(e, 'sha256'), 'hex') for update;
  if not found or inv.used_at is not null or inv.fails >= 5 then
    return 'no';
  end if;
  if inv.code_hash <> encode(extensions.digest(inv.salt || c, 'sha256'), 'hex') then
    update public.jachul_invites set fails = fails + 1 where email_sha = inv.email_sha;
    return 'no';
  end if;
  -- 명부(jachul_members)에 있는 계정만
  update auth.users u
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where lower(u.email) = e
     and exists (select 1 from public.jachul_members m where lower(m.email) = e);
  get diagnostics n = row_count;
  if n <> 1 then
    return 'no';
  end if;
  update public.jachul_invites set used_at = now() where email_sha = inv.email_sha;
  return 'ok';
end;
$$;

revoke all on function public.jachul_set_password(text, text, text) from public;
grant execute on function public.jachul_set_password(text, text, text) to anon, authenticated;
