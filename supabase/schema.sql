-- Error AI database schema
create extension if not exists pgcrypto;

create table if not exists public.errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_type text not null check (source_type in ('image', 'text', 'image_text')),
  original_text text,
  context text,
  image_path text,
  status text not null default 'pending' check (status in ('pending', 'done', 'error'))
);

create table if not exists public.error_analyses (
  id uuid primary key default gen_random_uuid(),
  error_id uuid not null unique references public.errors(id) on delete cascade,
  created_at timestamptz not null default now(),
  title text,
  error_type text,
  language text,
  severity text check (severity in ('low', 'medium', 'high', 'critical')),
  explanation text,
  cause text,
  solution_steps text[],
  code_example text,
  prevention text,
  confidence text
);

alter table public.errors enable row level security;
alter table public.error_analyses enable row level security;

-- 브라우저가 DB를 직접 쓰지 않습니다.
-- Supabase Edge Function의 service role/secret key만 DB를 사용합니다.

-- Browser roles cannot read or write these tables directly.
revoke all privileges on table public.errors from anon, authenticated;
revoke all privileges on table public.error_analyses from anon, authenticated;

-- Supabase Edge Function backend access.
grant select, insert, update, delete on table public.errors to service_role;
grant select, insert, update, delete on table public.error_analyses to service_role;
