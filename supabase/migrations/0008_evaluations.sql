-- Refatoração da Prontidão: avaliação de qualidade por múltiplos avaliadores.
-- Cada usuário do app avalia cada roleplay em 7 critérios (nota 1–5 + comentário);
-- o score do roleplay passa a ser a qualidade média ponderada.
--
-- Não-destrutivo: as colunas antigas de pontuação (roleplay_readiness.score_*/note_*
-- e os pesos weight_* em app_settings/tracking_clients) permanecem, mas deixam de
-- ser usadas pela aplicação.

-- ── profiles: espelho legível de auth.users (o client não lista auth.users) ──
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Popular profiles a cada novo usuário. SECURITY DEFINER pois roda no contexto
-- do auth; search_path fixo por segurança.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill dos usuários já existentes (idempotente).
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "auth_read_profiles" on public.profiles;
create policy "auth_read_profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "own_profile_write" on public.profiles;
create policy "own_profile_write" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- ── roleplay_evaluations: 1 linha por (roleplay, avaliador) ─────────────────
create table if not exists public.roleplay_evaluations (
  id              uuid primary key default gen_random_uuid(),
  readiness_id    uuid not null references public.roleplay_readiness(id) on delete cascade,
  evaluator_id    uuid not null references auth.users(id) default auth.uid(),
  scores          jsonb not null default '{}'::jsonb,   -- { "<key>": 1..5 }
  comments        jsonb not null default '{}'::jsonb,   -- { "<key>": "texto" }
  overall_comment text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (readiness_id, evaluator_id)
);

create index if not exists idx_evaluations_readiness on public.roleplay_evaluations(readiness_id);

drop trigger if exists trg_roleplay_evaluations_updated_at on public.roleplay_evaluations;
create trigger trg_roleplay_evaluations_updated_at before update on public.roleplay_evaluations
  for each row execute function public.set_updated_at();

alter table public.roleplay_evaluations enable row level security;

-- leitura: todos autenticados (o consolidado mostra as avaliações de todos)
drop policy if exists "auth_read_evaluations" on public.roleplay_evaluations;
create policy "auth_read_evaluations" on public.roleplay_evaluations
  for select using (auth.role() = 'authenticated');

-- escrita: só o próprio avaliador
drop policy if exists "own_evaluations_write" on public.roleplay_evaluations;
create policy "own_evaluations_write" on public.roleplay_evaluations
  for all using (evaluator_id = auth.uid()) with check (evaluator_id = auth.uid());

-- ── pesos dos critérios de avaliação (globais por usuário, em app_settings) ──
alter table public.app_settings
  add column if not exists eval_weights jsonb not null default
    '{"verossimilhanca":20,"memoria":20,"realismo_fala":15,"dificuldade":15,"consistencia":15,"engajamento":10,"valor_pedagogico":5}'::jsonb;
