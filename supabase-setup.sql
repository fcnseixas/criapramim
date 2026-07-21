-- ===== CriaPraMim — esquema do Supabase =====
-- Rode isto no Supabase: SQL Editor > New query > Run.

-- Perfis (1 por usuário) com papel e cota
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user',            -- 'user' ou 'admin'
  plan text not null default 'basico',
  credits_total int not null default 40,        -- cota de imagens/mês
  credits_used  int not null default 0,
  period_start  timestamptz not null default now(),
  created_at    timestamptz default now()
);

alter table public.profiles enable row level security;
-- o usuário só LÊ o próprio perfil (updates de cota são feitos pelo backend com service role)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);

-- cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Projetos salvos (posts, textos e imagens em JSON)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.projects enable row level security;
drop policy if exists projects_all_own on public.projects;
create policy projects_all_own on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Depois de se cadastrar no app, vire admin e libere cota alta com:
-- update public.profiles set role='admin', credits_total=100000 where email='fcnseixas@gmail.com';
