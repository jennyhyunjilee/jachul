-- 로그인한 회원의 "지금 목표"(역·도착 시간·준비 시간 등)도 계정에 저장. 읽기/쓰기는 기존 RLS(본인 것만) 그대로.
alter table public.jachul_routes add column if not exists goal jsonb not null default '{}'::jsonb;
