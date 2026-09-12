-- Módulo Playbooks — playbook do cliente estruturado por IA a partir do material
-- dele, editado aqui e enviado para a conta na Perfecting.
-- Hierarquia espelha a da API: playbook → call_types (etapas) → call_blocks
-- (subetapas). Depois de enviado, a Criação express consegue gerar os roleplays
-- da jornada por cima dele (modo "Pelo playbook da conta").

-- ── playbooks: uma autoria por cliente ─────────────────────────────────────
create table if not exists public.playbooks (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  input_files     jsonb not null default '[]'::jsonb,   -- [{name, path, chars}]
  input_text      text,                                 -- material concatenado
  prompt_override text,                                 -- prompt usado (rastreabilidade)
  status          text not null default 'draft',        -- draft|generating|ready|exporting|exported|error
  error_detail    jsonb,
  usage           jsonb,                                -- tokens da chamada LLM
  -- O que já foi criado no destino, para o reenvio ser idempotente (a API não
  -- tem upsert: sem isso, um retry depois de falha no meio duplicaria etapas):
  -- { connection_id, perfecting_playbook_id, call_types: {<local_id>: <remote_id>},
  --   call_blocks: {<local_id>: <remote_id>} }
  export_run      jsonb,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── playbook_call_types: as etapas da jornada, em ordem ────────────────────
create table if not exists public.playbook_call_types (
  id                uuid primary key default gen_random_uuid(),
  playbook_id       uuid not null references public.playbooks(id) on delete cascade,
  position          integer not null default 0,
  name              text not null,
  description       text,
  call_context_slug text,                               -- resolvido para id no envio
  methodology_slug  text,                               -- vinculada à etapa no envio
  created_by        uuid references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── playbook_call_blocks: as subetapas de cada etapa ───────────────────────
-- ⚠️ Desvio consciente da convenção PT-BR das colunas de domínio (cf.
-- trail_items.objetivo): estes campos existem só para virar payload de
-- POST .../call_blocks, e o nome igual ao da API deixa o export conferível
-- de bater o olho.
create table if not exists public.playbook_call_blocks (
  id                uuid primary key default gen_random_uuid(),
  call_type_id      uuid not null references public.playbook_call_types(id) on delete cascade,
  position          integer not null default 0,
  name              text not null,
  description       text,
  objective         text,
  sample_questions  jsonb not null default '[]'::jsonb, -- string[]
  what_to_do        jsonb not null default '[]'::jsonb, -- string[]
  what_to_avoid     jsonb not null default '[]'::jsonb, -- string[]
  created_by        uuid references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── ponte local → id na conta de destino (padrão offer_perfecting_ids) ─────
create table if not exists public.playbook_perfecting_ids (
  playbook_id            uuid not null references public.playbooks(id) on delete cascade,
  connection_id          uuid not null references public.connections(id) on delete cascade,
  perfecting_playbook_id integer not null,
  created_at             timestamptz not null default now(),
  primary key (playbook_id, connection_id)
);

-- ── índices ────────────────────────────────────────────────────────────────
create index if not exists idx_playbooks_status on public.playbooks(status);
create index if not exists idx_playbook_call_types_playbook on public.playbook_call_types(playbook_id);
create index if not exists idx_playbook_call_blocks_call_type on public.playbook_call_blocks(call_type_id);

-- ── trigger updated_at (mesma função public.set_updated_at de 0001_init) ───
do $$
declare t text;
begin
  foreach t in array array['playbooks','playbook_call_types','playbook_call_blocks']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on public.%1$s;
       create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS: linhas próprias, como trail_plans/trails/trail_items ──────────────
alter table public.playbooks              enable row level security;
alter table public.playbook_call_types    enable row level security;
alter table public.playbook_call_blocks   enable row level security;
alter table public.playbook_perfecting_ids enable row level security;

drop policy if exists "own_playbooks" on public.playbooks;
create policy "own_playbooks" on public.playbooks
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "own_playbook_call_types" on public.playbook_call_types;
create policy "own_playbook_call_types" on public.playbook_call_types
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "own_playbook_call_blocks" on public.playbook_call_blocks;
create policy "own_playbook_call_blocks" on public.playbook_call_blocks
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- ponte delega ao dono do pai (padrão offer_perfecting_ids em 0002_rls)
drop policy if exists "own_playbook_perfecting_ids" on public.playbook_perfecting_ids;
create policy "own_playbook_perfecting_ids" on public.playbook_perfecting_ids
  for all using (
    exists (select 1 from public.playbooks p where p.id = playbook_id and p.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.playbooks p where p.id = playbook_id and p.created_by = auth.uid())
  );

-- ── realtime: a tela do playbook observa a geração ao vivo ─────────────────
alter publication supabase_realtime add table public.playbooks;
