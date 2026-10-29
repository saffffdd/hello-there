-- Rei da Quadra: esquema inicial para Supabase.
-- Execute no SQL Editor do projeto Supabase. Configure Auth e variáveis no app antes de ativar nuvem.
create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','finished')),
  state jsonb not null default '{}'::jsonb,
  share_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.session_players (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  match_number integer not null,
  played_at timestamptz not null default now(),
  team_a uuid[] not null,
  team_b uuid[] not null,
  winner text not null check (winner in ('A','B')),
  loser text not null check (loser in ('A','B')),
  entrants uuid[] not null default '{}',
  snapshot_before jsonb not null,
  unique (session_id, match_number),
  check (winner <> loser),
  check (cardinality(team_a) = 2 and cardinality(team_b) = 2)
);

create index if not exists sessions_owner_updated_idx on public.sessions(owner_id, updated_at desc);
create index if not exists matches_session_number_idx on public.matches(session_id, match_number desc);

alter table public.sessions enable row level security;
alter table public.players enable row level security;
alter table public.session_players enable row level security;
alter table public.matches enable row level security;

drop policy if exists "Owners manage own sessions" on public.sessions;
create policy "Owners manage own sessions" on public.sessions for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners manage own players" on public.players;
create policy "Owners manage own players" on public.players for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners manage session players" on public.session_players;
create policy "Owners manage session players" on public.session_players for all
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()));

drop policy if exists "Owners manage match history" on public.matches;
create policy "Owners manage match history" on public.matches for all
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()));

-- IMPORTANTE:
-- Não habilite leitura pública de sessions.state, pois contém estado administrativo.
-- Compartilhamento público deve ser feito por uma Edge Function que valide share_token
-- e retorne somente os campos de leitura; não exponha service_role no navegador.
-- Para consistência transacional entre estado e histórico, use RPC/Edge Function no servidor.
-- Este esquema é a base de persistência e RLS, não configura sozinho a sincronização em tempo real.