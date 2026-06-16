-- Rounds de avaliação: agrupa os roleplays/avaliações de um cliente em rodadas.
-- Cada round é um "container" de uma rodada (ex.: Round 1, Round 2). Os roleplays
-- passam a pertencer a um round; clonar um round duplica suas linhas de
-- roleplay_readiness, então cada round tem suas próprias avaliações arquivadas
-- (a unique (readiness_id, evaluator_id) de roleplay_evaluations continua intacta).
--
-- origin_readiness_id liga as cópias do "mesmo" roleplay entre rounds (linhagem),
-- para comparar a evolução. Chave de linhagem = coalesce(origin_readiness_id, id).

-- ── evaluation_rounds: uma rodada de avaliação de um cliente ────────────────
create table if not exists public.evaluation_rounds (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.tracking_clients(id) on delete cascade,
  name        text not null,                          -- ex.: 'Round 1', 'Round 2 — junho'
  position    integer not null default 0,             -- ordenação/numeração
  status      text not null default 'aberto',         -- aberto | fechado
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_rounds_client on public.evaluation_rounds(client_id);

-- ── roleplay_readiness: vínculo ao round + linhagem entre rounds ────────────
alter table public.roleplay_readiness
  add column if not exists round_id uuid references public.evaluation_rounds(id) on delete cascade,
  add column if not exists origin_readiness_id uuid references public.roleplay_readiness(id) on delete set null;

create index if not exists idx_readiness_round on public.roleplay_readiness(round_id);

-- ── trigger updated_at (mesma função public.set_updated_at de 0001_init) ────
drop trigger if exists trg_evaluation_rounds_updated_at on public.evaluation_rounds;
create trigger trg_evaluation_rounds_updated_at before update on public.evaluation_rounds
  for each row execute function public.set_updated_at();

-- ── RLS — artefato de equipe compartilhado (padrão de 0005_readiness) ───────
alter table public.evaluation_rounds enable row level security;

drop policy if exists "auth_all_rounds" on public.evaluation_rounds;
create policy "auth_all_rounds" on public.evaluation_rounds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Backfill: 1 "Round 1" por cliente; todos os roleplays atuais entram nele ─
do $$
declare c record;
declare r_id uuid;
begin
  for c in select id from public.tracking_clients loop
    -- só cria/associa se o cliente ainda não tem nenhum round
    if not exists (select 1 from public.evaluation_rounds where client_id = c.id) then
      insert into public.evaluation_rounds (client_id, name, position, status)
      values (c.id, 'Round 1', 0, 'aberto')
      returning id into r_id;

      update public.roleplay_readiness
        set round_id = r_id
        where client_id = c.id and round_id is null;
    end if;
  end loop;
end $$;

-- Após o backfill, todo roleplay deve estar em um round.
alter table public.roleplay_readiness
  alter column round_id set not null;
