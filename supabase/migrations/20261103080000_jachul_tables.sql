-- 쟈철(Claude 버전) 전용 테이블. 같은 프로젝트의 다른 앱 테이블(members 등)과 겹치지 않게 jachul_ 로 시작.

-- 회원 명부: tools/seed_members.py 로 채움. 로그인한 회원은 자기 줄만 읽을 수 있음.
create table public.jachul_members (
  email text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.jachul_members enable row level security;
create policy "jachul members: read own row" on public.jachul_members
  for select to authenticated using (email = (select auth.jwt() ->> 'email'));

-- 회원별 저장 경로. 본인 것만 읽고 쓸 수 있음.
create table public.jachul_routes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  routines jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.jachul_routes enable row level security;
create policy "own routes: read" on public.jachul_routes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own routes: insert" on public.jachul_routes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own routes: update" on public.jachul_routes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
