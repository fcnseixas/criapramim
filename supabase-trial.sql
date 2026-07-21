-- Captura de leads do modo teste (rode uma vez no SQL Editor)
create table if not exists public.trials (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  ip text,
  user_agent text,
  used int not null default 0,
  created_at timestamptz default now()
);
alter table public.trials enable row level security;   -- só o backend (service role) acessa
create index if not exists trials_ip_idx on public.trials(ip);
