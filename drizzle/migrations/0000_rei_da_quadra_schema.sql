
create extension if not exists pgcrypto with schema extensions;

-- ========== TABLES ==========
create table public.players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index players_owner_name_uidx on public.players (owner_id, lower(name)) where archived_at is null;
create index players_owner_idx on public.players (owner_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 70),
  status text not null default 'active' check (status in ('active','paused','finished')),
  team_a uuid[] not null check (cardinality(team_a) = 2),
  team_b uuid[] not null check (cardinality(team_b) = 2),
  reserve uuid[] not null default '{}',
  next_entrants uuid[] check (next_entrants is null or cardinality(next_entrants) = 2),
  match_no integer not null default 1 check (match_no >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_owner_updated_idx on public.sessions (owner_id, updated_at desc);

create table public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  owner_id uuid not null,
  display_name text not null,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index session_participants_player_idx on public.session_participants (player_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  owner_id uuid not null,
  match_number integer not null,
  played_at timestamptz not null default now(),
  team_a uuid[] not null check (cardinality(team_a) = 2),
  team_b uuid[] not null check (cardinality(team_b) = 2),
  winner_side text not null check (winner_side in ('A','B')),
  entrants uuid[] not null default '{}',
  state_before jsonb,
  unique (session_id, match_number)
);
create index matches_session_number_idx on public.matches (session_id, match_number desc);

create table public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  owner_id uuid not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index share_tokens_session_idx on public.share_tokens (session_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avoid_rematches boolean not null default true,
  active_session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== GRANTS ==========
grant select, insert, update on public.players to authenticated;
grant select on public.sessions, public.session_participants, public.matches, public.share_tokens to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avoid_rematches) on public.profiles to authenticated;
grant all on public.players, public.sessions, public.session_participants, public.matches, public.share_tokens, public.profiles to service_role;

-- ========== RLS ==========
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.matches enable row level security;
alter table public.share_tokens enable row level security;
alter table public.profiles enable row level security;

create policy "Owner reads players" on public.players for select to authenticated using (owner_id = auth.uid());
create policy "Owner inserts players" on public.players for insert to authenticated with check (owner_id = auth.uid());
create policy "Owner updates players" on public.players for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owner reads sessions" on public.sessions for select to authenticated using (owner_id = auth.uid());
create policy "Owner reads participants" on public.session_participants for select to authenticated using (owner_id = auth.uid());
create policy "Owner reads matches" on public.matches for select to authenticated using (owner_id = auth.uid());
create policy "Owner reads share tokens" on public.share_tokens for select to authenticated using (owner_id = auth.uid());
create policy "User reads own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "User updates own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ========== TRIGGERS ==========
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;
create trigger players_touch before update on public.players for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ========== HELPERS ==========
create or replace function public._lock_session(p_session_id uuid) returns public.sessions
language plpgsql security definer set search_path = public as $$
declare s public.sessions;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED: faça login para continuar.'; end if;
  select * into s from public.sessions where id = p_session_id and owner_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND: sessão não encontrada.'; end if;
  return s;
end; $$;

create or replace function public._validate_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.sessions; v_active uuid[]; v_court uuid[]; v_all uuid[];
begin
  select * into s from public.sessions where id = p_session_id;
  if s.status = 'finished' then return; end if;
  select coalesce(array_agg(player_id), '{}') into v_active from public.session_participants where session_id = p_session_id and active;
  v_court := s.team_a || s.team_b;
  if cardinality(v_active) < 4 then raise exception 'INVALID_STATE: são necessários pelo menos quatro participantes ativos.'; end if;
  if (select count(distinct x) from unnest(v_court) x) <> 4 then raise exception 'INVALID_STATE: a quadra precisa ter quatro jogadores distintos.'; end if;
  if (select count(distinct x) from unnest(s.reserve) x) <> cardinality(s.reserve) then raise exception 'INVALID_STATE: há jogadores duplicados na reserva.'; end if;
  if v_court && s.reserve then raise exception 'INVALID_STATE: um jogador não pode estar na quadra e na reserva.'; end if;
  v_all := v_court || s.reserve;
  if not (v_all <@ v_active and v_active <@ v_all) or cardinality(v_all) <> cardinality(v_active) then
    raise exception 'INVALID_STATE: quadra e reserva não correspondem aos participantes ativos.';
  end if;
  if s.next_entrants is not null and not (s.next_entrants <@ s.reserve) then
    raise exception 'INVALID_STATE: próximos desafiantes precisam estar na reserva.';
  end if;
end; $$;

-- ========== RPCs ==========
create or replace function public.create_session(p_name text, p_team_a uuid[], p_team_b uuid[], p_reserve uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_all uuid[] := p_team_a || p_team_b || p_reserve; v_count int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED: faça login para continuar.'; end if;
  if (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then raise exception 'INVALID_STATE: jogadores duplicados.'; end if;
  select count(*) into v_count from public.players where id = any(v_all) and owner_id = auth.uid() and archived_at is null;
  if v_count <> cardinality(v_all) then raise exception 'INVALID_STATE: há jogadores inválidos na sessão.'; end if;
  insert into public.sessions (owner_id, name, team_a, team_b, reserve)
  values (auth.uid(), coalesce(nullif(btrim(p_name), ''), 'Jogo de Beach Tennis'), p_team_a, p_team_b, coalesce(p_reserve, '{}'))
  returning id into v_id;
  insert into public.session_participants (session_id, player_id, owner_id, display_name)
  select v_id, p.id, auth.uid(), p.name from public.players p where p.id = any(v_all);
  perform public._validate_session(v_id);
  update public.profiles set active_session_id = v_id where id = auth.uid();
  return v_id;
end; $$;

create or replace function public.record_result(p_session_id uuid, p_expected_match_no int, p_loser_side text, p_entrants uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions; v_winner uuid[]; v_loser uuid[]; v_pool uuid[]; v_winner_side text;
begin
  s := public._lock_session(p_session_id);
  if s.status <> 'active' then raise exception 'NOT_ACTIVE: a sessão não está em andamento.'; end if;
  if s.match_no <> p_expected_match_no then raise exception 'MATCH_CHANGED: esta partida já foi registrada ou mudou. A quadra foi atualizada.'; end if;
  if p_loser_side not in ('A','B') then raise exception 'INVALID_INPUT: lado perdedor inválido.'; end if;
  v_winner_side := case when p_loser_side = 'A' then 'B' else 'A' end;
  v_winner := case when v_winner_side = 'A' then s.team_a else s.team_b end;
  v_loser := case when p_loser_side = 'A' then s.team_a else s.team_b end;
  v_pool := s.reserve || v_loser;
  if p_entrants is null or cardinality(p_entrants) <> 2 or p_entrants[1] = p_entrants[2] or not (p_entrants <@ v_pool) then
    raise exception 'INVALID_INPUT: os desafiantes precisam ser dois jogadores distintos da reserva.';
  end if;
  insert into public.matches (session_id, owner_id, match_number, team_a, team_b, winner_side, entrants, state_before)
  values (s.id, s.owner_id, s.match_no, s.team_a, s.team_b, v_winner_side, p_entrants,
    jsonb_build_object('team_a', s.team_a, 'team_b', s.team_b, 'reserve', s.reserve, 'next_entrants', s.next_entrants, 'status', s.status));
  update public.sessions set
    team_a = case when v_winner_side = 'A' then v_winner else p_entrants end,
    team_b = case when v_winner_side = 'B' then v_winner else p_entrants end,
    reserve = coalesce(array(select x from unnest(v_pool) with ordinality t(x, ord) where x <> all(p_entrants) order by ord), '{}'),
    next_entrants = null, match_no = s.match_no + 1, updated_at = now()
  where id = s.id;
  perform public._validate_session(s.id);
end; $$;

create or replace function public.undo_last_match(p_session_id uuid, p_expected_match_no int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions; m public.matches; v_reserve uuid[]; v_ta uuid[]; v_tb uuid[]; v_extra uuid[];
begin
  s := public._lock_session(p_session_id);
  if s.status = 'finished' then raise exception 'FINISHED: sessão encerrada não pode ser alterada.'; end if;
  if s.match_no <> p_expected_match_no then raise exception 'MATCH_CHANGED: o estado da sessão mudou. A quadra foi atualizada.'; end if;
  select * into m from public.matches where session_id = s.id order by match_number desc limit 1;
  if not found or m.match_number <> s.match_no - 1 then raise exception 'NOTHING_TO_UNDO: não há partida para desfazer.'; end if;
  if m.state_before is null then raise exception 'NOTHING_TO_UNDO: esta partida foi importada sem o estado anterior e não pode ser desfeita.'; end if;
  v_ta := array(select jsonb_array_elements_text(m.state_before->'team_a')::uuid);
  v_tb := array(select jsonb_array_elements_text(m.state_before->'team_b')::uuid);
  v_reserve := array(select jsonb_array_elements_text(m.state_before->'reserve')::uuid);
  -- participants added after the match keep their place at the end of the queue
  select coalesce(array_agg(player_id order by joined_at), '{}') into v_extra from public.session_participants
    where session_id = s.id and active and not (player_id = any(v_ta || v_tb || v_reserve));
  update public.sessions set team_a = v_ta, team_b = v_tb, reserve = v_reserve || v_extra,
    next_entrants = case when jsonb_typeof(m.state_before->'next_entrants') = 'array'
      then array(select jsonb_array_elements_text(m.state_before->'next_entrants')::uuid) else null end,
    status = 'active', match_no = m.match_number, updated_at = now()
  where id = s.id;
  delete from public.matches where id = m.id;
  begin
    perform public._validate_session(s.id);
  exception when others then
    raise exception 'UNDO_INCONSISTENT: não foi possível desfazer porque participantes mudaram desde a partida (%).', sqlerrm;
  end;
end; $$;

create or replace function public.reorder_reserve(p_session_id uuid, p_reserve uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions;
begin
  s := public._lock_session(p_session_id);
  if s.status = 'finished' then raise exception 'FINISHED: sessão encerrada.'; end if;
  if cardinality(p_reserve) <> cardinality(s.reserve) or not (p_reserve <@ s.reserve and s.reserve <@ p_reserve) then
    raise exception 'MATCH_CHANGED: a fila mudou em outro dispositivo. Atualizamos a reserva.';
  end if;
  update public.sessions set reserve = p_reserve, updated_at = now() where id = s.id;
  perform public._validate_session(s.id);
end; $$;

create or replace function public.set_next_entrants(p_session_id uuid, p_entrants uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions;
begin
  s := public._lock_session(p_session_id);
  if s.status = 'finished' then raise exception 'FINISHED: sessão encerrada.'; end if;
  if p_entrants is not null and (cardinality(p_entrants) <> 2 or p_entrants[1] = p_entrants[2] or not (p_entrants <@ s.reserve)) then
    raise exception 'INVALID_INPUT: selecione dois jogadores distintos da reserva.';
  end if;
  update public.sessions set next_entrants = p_entrants, updated_at = now() where id = s.id;
end; $$;

create or replace function public.set_session_status(p_session_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions;
begin
  s := public._lock_session(p_session_id);
  if s.status = 'finished' then raise exception 'FINISHED: esta sessão já foi encerrada.'; end if;
  if p_status not in ('active','paused','finished') then raise exception 'INVALID_INPUT: status inválido.'; end if;
  update public.sessions set status = p_status, updated_at = now() where id = s.id;
end; $$;

create or replace function public.add_session_participant(p_session_id uuid, p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions; p public.players;
begin
  s := public._lock_session(p_session_id);
  if s.status = 'finished' then raise exception 'FINISHED: sessão encerrada.'; end if;
  select * into p from public.players where id = p_player_id and owner_id = auth.uid() and archived_at is null;
  if not found then raise exception 'INVALID_INPUT: jogador não encontrado.'; end if;
  if exists (select 1 from public.session_participants where session_id = s.id and player_id = p.id and active) then
    raise exception 'INVALID_INPUT: esse jogador já participa desta sessão.';
  end if;
  insert into public.session_participants (session_id, player_id, owner_id, display_name)
  values (s.id, p.id, s.owner_id, p.name)
  on conflict (session_id, player_id) do update set active = true, display_name = excluded.display_name, joined_at = now();
  update public.sessions set reserve = reserve || p.id, updated_at = now() where id = s.id;
  perform public._validate_session(s.id);
end; $$;

create or replace function public.remove_session_participant(p_session_id uuid, p_player_id uuid, p_replacement uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions; v_active int;
begin
  s := public._lock_session(p_session_id);
  if s.status = 'finished' then raise exception 'FINISHED: sessão encerrada.'; end if;
  select count(*) into v_active from public.session_participants where session_id = s.id and active;
  if v_active <= 4 then raise exception 'INVALID_INPUT: a sessão precisa manter pelo menos quatro participantes ativos.'; end if;
  if p_player_id = any(s.team_a || s.team_b) then
    if p_replacement is null or not (p_replacement = any(s.reserve)) then
      raise exception 'INVALID_INPUT: escolha um substituto da reserva.';
    end if;
    update public.sessions set
      team_a = array_replace(team_a, p_player_id, p_replacement),
      team_b = array_replace(team_b, p_player_id, p_replacement),
      reserve = array_remove(reserve, p_replacement)
    where id = s.id;
  else
    update public.sessions set reserve = array_remove(reserve, p_player_id) where id = s.id;
  end if;
  update public.sessions set updated_at = now(),
    next_entrants = case when next_entrants && array[p_player_id, p_replacement] then null else next_entrants end
  where id = s.id;
  update public.session_participants set active = false where session_id = s.id and player_id = p_player_id;
  perform public._validate_session(s.id);
end; $$;

create or replace function public.set_active_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED: faça login para continuar.'; end if;
  if p_session_id is not null and not exists (select 1 from public.sessions where id = p_session_id and owner_id = auth.uid()) then
    raise exception 'NOT_FOUND: sessão não encontrada.';
  end if;
  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  update public.profiles set active_session_id = p_session_id where id = auth.uid();
end; $$;

create or replace function public.rename_player(p_player_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED: faça login para continuar.'; end if;
  update public.players set name = btrim(p_name) where id = p_player_id and owner_id = auth.uid() and archived_at is null;
  if not found then raise exception 'NOT_FOUND: jogador não encontrado.'; end if;
  update public.session_participants set display_name = btrim(p_name) where player_id = p_player_id and owner_id = auth.uid();
end; $$;

create or replace function public.archive_player(p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED: faça login para continuar.'; end if;
  if exists (select 1 from public.session_participants sp join public.sessions s on s.id = sp.session_id
             where sp.player_id = p_player_id and sp.active and s.status <> 'finished' and s.owner_id = auth.uid()) then
    raise exception 'IN_SESSION: este jogador está em uma sessão ativa. Remova-o da sessão primeiro.';
  end if;
  update public.players set archived_at = now() where id = p_player_id and owner_id = auth.uid() and archived_at is null;
  if not found then raise exception 'NOT_FOUND: jogador não encontrado.'; end if;
end; $$;

create or replace function public.create_share_link(p_session_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions; v_token text;
begin
  s := public._lock_session(p_session_id);
  update public.share_tokens set revoked_at = now() where session_id = s.id and revoked_at is null;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.share_tokens (session_id, owner_id, token) values (s.id, s.owner_id, v_token);
  return v_token;
end; $$;

create or replace function public.revoke_share_link(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions;
begin
  s := public._lock_session(p_session_id);
  update public.share_tokens set revoked_at = now() where session_id = s.id and revoked_at is null;
end; $$;

create or replace function public.get_shared_session(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_session_id uuid; s public.sessions; v_names jsonb;
begin
  if p_token is null or char_length(p_token) < 20 then return null; end if;
  select session_id into v_session_id from public.share_tokens where token = p_token and revoked_at is null;
  if v_session_id is null then return null; end if;
  select * into s from public.sessions where id = v_session_id;
  select coalesce(jsonb_object_agg(player_id::text, display_name), '{}') into v_names from public.session_participants where session_id = s.id;
  return jsonb_build_object(
    'name', s.name, 'status', s.status, 'match_no', s.match_no, 'updated_at', s.updated_at,
    'team_a', (select coalesce(jsonb_agg(coalesce(v_names->>x::text, 'Jogador') order by o), '[]') from unnest(s.team_a) with ordinality t(x,o)),
    'team_b', (select coalesce(jsonb_agg(coalesce(v_names->>x::text, 'Jogador') order by o), '[]') from unnest(s.team_b) with ordinality t(x,o)),
    'reserve', (select coalesce(jsonb_agg(coalesce(v_names->>x::text, 'Jogador') order by o), '[]') from unnest(s.reserve) with ordinality t(x,o)),
    'matches', (select coalesce(jsonb_agg(jsonb_build_object(
        'match_number', m.match_number, 'played_at', m.played_at, 'winner_side', m.winner_side,
        'team_a', (select jsonb_agg(coalesce(v_names->>x::text, 'Jogador') order by o) from unnest(m.team_a) with ordinality t(x,o)),
        'team_b', (select jsonb_agg(coalesce(v_names->>x::text, 'Jogador') order by o) from unnest(m.team_b) with ordinality t(x,o))
      ) order by m.match_number desc), '[]') from public.matches m where m.session_id = s.id)
  );
end; $$;

create or replace function public.import_backup(p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_map jsonb := '{}'; v_p jsonb; v_s jsonb; v_h jsonb; v_id uuid; v_sid uuid;
  v_players int := 0; v_sessions int := 0; v_matches int := 0; v_idx int; v_undo jsonb; v_hist_len int;
  v_status text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED: faça login para continuar.'; end if;
  if jsonb_typeof(p_data->'players') <> 'array' or jsonb_typeof(p_data->'sessions') <> 'array' then
    raise exception 'INVALID_BACKUP: formato de backup inválido.';
  end if;
  -- players (global list + every session participant)
  for v_p in select value from jsonb_array_elements(p_data->'players')
    union all select pp.value from jsonb_array_elements(p_data->'sessions') ss, jsonb_array_elements(coalesce(ss.value->'participants','[]')) pp
  loop
    if v_map ? (v_p->>'id') then continue; end if;
    if coalesce(btrim(v_p->>'name'), '') = '' then raise exception 'INVALID_BACKUP: jogador sem nome.'; end if;
    select id into v_id from public.players where owner_id = v_uid and archived_at is null and lower(name) = lower(btrim(v_p->>'name'));
    if v_id is null then
      insert into public.players (owner_id, name) values (v_uid, left(btrim(v_p->>'name'), 60)) returning id into v_id;
      v_players := v_players + 1;
    end if;
    v_map := v_map || jsonb_build_object(v_p->>'id', v_id::text);
    v_id := null;
  end loop;
  for v_s in select value from jsonb_array_elements(p_data->'sessions') loop
    v_status := coalesce(v_s->>'status', 'finished');
    if v_status not in ('active','paused','finished') then v_status := 'finished'; end if;
    insert into public.sessions (owner_id, name, status, team_a, team_b, reserve, match_no, created_at, updated_at)
    values (v_uid, left(coalesce(nullif(btrim(v_s->>'name'),''), 'Sessão importada'), 70), v_status,
      array(select (v_map->>x)::uuid from jsonb_array_elements_text(v_s->'teamA') with ordinality t(x,o) order by o),
      array(select (v_map->>x)::uuid from jsonb_array_elements_text(v_s->'teamB') with ordinality t(x,o) order by o),
      array(select (v_map->>x)::uuid from jsonb_array_elements_text(coalesce(v_s->'reserve','[]')) with ordinality t(x,o) order by o),
      greatest(1, coalesce((v_s->>'matchNo')::int, jsonb_array_length(coalesce(v_s->'history','[]')) + 1)),
      coalesce((v_s->>'createdAt')::timestamptz, now()), coalesce((v_s->>'updatedAt')::timestamptz, now()))
    returning id into v_sid;
    insert into public.session_participants (session_id, player_id, owner_id, display_name, active)
    select v_sid, (v_map->>(pp->>'id'))::uuid, v_uid, btrim(pp->>'name'), coalesce((pp->>'active')::boolean, true)
    from jsonb_array_elements(coalesce(v_s->'participants','[]')) pp
    on conflict do nothing;
    v_hist_len := jsonb_array_length(coalesce(v_s->'history','[]'));
    v_idx := 0;
    for v_h in select value from jsonb_array_elements(coalesce(v_s->'history','[]')) loop
      v_undo := case when jsonb_array_length(coalesce(v_s->'undoStack','[]')) = v_hist_len then v_s->'undoStack'->v_idx else null end;
      insert into public.matches (session_id, owner_id, match_number, played_at, team_a, team_b, winner_side, entrants, state_before)
      values (v_sid, v_uid, (v_h->>'matchNumber')::int, coalesce((v_h->>'playedAt')::timestamptz, now()),
        array(select (v_map->>x)::uuid from jsonb_array_elements_text(v_h->'teamA') with ordinality t(x,o) order by o),
        array(select (v_map->>x)::uuid from jsonb_array_elements_text(v_h->'teamB') with ordinality t(x,o) order by o),
        coalesce(v_h->>'winnerSide', 'A'),
        array(select (v_map->>x)::uuid from jsonb_array_elements_text(coalesce(v_h->'entrants','[]')) with ordinality t(x,o) order by o),
        case when v_undo is null then null else jsonb_build_object(
          'team_a', (select jsonb_agg(v_map->>x order by o) from jsonb_array_elements_text(v_undo->'teamA') with ordinality t(x,o)),
          'team_b', (select jsonb_agg(v_map->>x order by o) from jsonb_array_elements_text(v_undo->'teamB') with ordinality t(x,o)),
          'reserve', coalesce((select jsonb_agg(v_map->>x order by o) from jsonb_array_elements_text(v_undo->'reserve') with ordinality t(x,o)), '[]'),
          'next_entrants', null, 'status', coalesce(v_undo->>'status','active')) end);
      v_idx := v_idx + 1; v_matches := v_matches + 1;
    end loop;
    perform public._validate_session(v_sid);
    v_sessions := v_sessions + 1;
  end loop;
  return jsonb_build_object('players', v_players, 'sessions', v_sessions, 'matches', v_matches);
end; $$;

-- Lock down function execution
revoke execute on function public._lock_session(uuid), public._validate_session(uuid) from public, anon, authenticated;
revoke execute on function public.create_session(text, uuid[], uuid[], uuid[]), public.record_result(uuid,int,text,uuid[]),
  public.undo_last_match(uuid,int), public.reorder_reserve(uuid,uuid[]), public.set_next_entrants(uuid,uuid[]),
  public.set_session_status(uuid,text), public.add_session_participant(uuid,uuid), public.remove_session_participant(uuid,uuid,uuid),
  public.set_active_session(uuid), public.rename_player(uuid,text), public.archive_player(uuid),
  public.create_share_link(uuid), public.revoke_share_link(uuid), public.import_backup(jsonb) from public, anon;
grant execute on function public.create_session(text, uuid[], uuid[], uuid[]), public.record_result(uuid,int,text,uuid[]),
  public.undo_last_match(uuid,int), public.reorder_reserve(uuid,uuid[]), public.set_next_entrants(uuid,uuid[]),
  public.set_session_status(uuid,text), public.add_session_participant(uuid,uuid), public.remove_session_participant(uuid,uuid,uuid),
  public.set_active_session(uuid), public.rename_player(uuid,text), public.archive_player(uuid),
  public.create_share_link(uuid), public.revoke_share_link(uuid), public.import_backup(jsonb) to authenticated;
revoke execute on function public.get_shared_session(text) from public;
grant execute on function public.get_shared_session(text) to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ========== REALTIME ==========
create or replace function public.notify_share_viewers() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_session uuid := coalesce(new.session_id, old.session_id); t record;
begin
  for t in select token from public.share_tokens where session_id = v_session and revoked_at is null loop
    begin
      perform realtime.send(jsonb_build_object('at', now()), 'changed', 'share:' || t.token, false);
    exception when others then null;
    end;
  end loop;
  return null;
end; $$;
create or replace function public.notify_share_viewers_session() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in select token from public.share_tokens where session_id = new.id and revoked_at is null loop
    begin
      perform realtime.send(jsonb_build_object('at', now()), 'changed', 'share:' || t.token, false);
    exception when others then null;
    end;
  end loop;
  return null;
end; $$;
revoke execute on function public.notify_share_viewers(), public.notify_share_viewers_session() from public, anon, authenticated;
create trigger sessions_notify_share after update on public.sessions for each row execute function public.notify_share_viewers_session();
create trigger matches_notify_share after insert or delete on public.matches for each row execute function public.notify_share_viewers();

alter publication supabase_realtime add table public.sessions, public.matches, public.players, public.session_participants, public.profiles;
