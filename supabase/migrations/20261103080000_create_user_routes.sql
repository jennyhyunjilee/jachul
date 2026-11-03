-- 회원별 저장 경로: 즐겨찾기·자주 가는 일정. 본인 것만 읽고 쓸 수 있습니다.
create table public.user_routes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  routines jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_routes enable row level security;

create policy "own routes: read" on public.user_routes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own routes: insert" on public.user_routes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own routes: update" on public.user_routes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
