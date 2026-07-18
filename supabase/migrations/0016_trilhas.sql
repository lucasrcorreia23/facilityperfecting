-- Módulo Trilhas — planos de trilhas de roleplay gerados por IA a partir dos
-- materiais do cliente (Intake de dados + Análise Data-to-Skill do Perfecting OS).
-- Um trail_plan gera N trails; cada trail é uma sequência ordenada de
-- trail_items (roleplays), que viram roleplay_drafts no pipeline existente.

-- ── methodology_sources: base de conhecimento de metodologia (scrape 1x) ────
create table if not exists public.methodology_sources (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  url          text not null,
  content      text,                                   -- texto coletado, editável na UI
  status       text not null default 'pending',        -- pending|fetched|error
  error_detail text,
  fetched_at   timestamptz,
  enabled      boolean not null default true,          -- incluir na geração
  position     integer not null default 0,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── trail_plans: uma execução de análise/plano por cliente ─────────────────
create table if not exists public.trail_plans (
  id                 uuid primary key default gen_random_uuid(),
  client_name        text not null,                    -- {{cliente}}
  sales_methodology  text,                             -- {{metodologia_vendas}} ex.: SPICED
  additional_context text,                             -- {{contexto_adicional}}
  seller_count       integer,                          -- {{numero_vendedores}} (opcional)
  website_url        text,
  input_files        jsonb not null default '[]'::jsonb, -- [{name, path, chars}]
  input_text         text,                             -- material concatenado (lido server-side)
  prompt_override    text,                             -- prompt efetivamente usado (rastreabilidade)
  status             text not null default 'draft',    -- draft|extracting|analyzing|analyzed|planning|ready|error
  analysis_markdown  text,                             -- etapa 1 (análise Data-to-Skill)
  plan_markdown      text,                             -- etapa 2 (racional do plano de trilhas)
  skill_gaps         jsonb,                            -- etapa 1 (array de gaps com scores)
  radar              jsonb,                            -- etapa 1 (radar por vendedor)
  offer_id           uuid references public.offers(id) on delete set null, -- offer única do plano
  error_detail       jsonb,
  usage              jsonb,                            -- tokens das chamadas LLM
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── trails: trilhas de um plano ────────────────────────────────────────────
create table if not exists public.trails (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.trail_plans(id) on delete cascade,
  name            text not null,
  description     text,
  skill_gaps_alvo jsonb not null default '[]'::jsonb,  -- string[]
  vendedores_alvo jsonb not null default '[]'::jsonb,  -- string[]
  position        integer not null default 0,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── trail_items: roleplays de cada trilha, em sequência ────────────────────
create table if not exists public.trail_items (
  id                 uuid primary key default gen_random_uuid(),
  trail_id           uuid not null references public.trails(id) on delete cascade,
  position           integer not null default 0,       -- ordem na sequência
  titulo             text not null,
  objetivo           text,
  skill              text,
  call_context_slug  text,
  difficulty         text not null default 'medium',   -- easy|medium|hard
  instrucoes_cenario text,
  draft_id           uuid references public.roleplay_drafts(id) on delete set null,
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── índices ────────────────────────────────────────────────────────────────
create index if not exists idx_trail_plans_status on public.trail_plans(status);
create index if not exists idx_trails_plan on public.trails(plan_id);
create index if not exists idx_trail_items_trail on public.trail_items(trail_id);
create index if not exists idx_trail_items_draft on public.trail_items(draft_id);

-- ── trigger updated_at (mesma função public.set_updated_at de 0001_init) ───
do $$
declare t text;
begin
  foreach t in array array['methodology_sources','trail_plans','trails','trail_items']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on public.%1$s;
       create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- methodology_sources: artefato de equipe compartilhado (padrão connections).
-- Planos/trilhas/itens: linhas próprias (alimentam sources→offers→drafts, que
-- também são own-rows).
alter table public.methodology_sources enable row level security;
alter table public.trail_plans         enable row level security;
alter table public.trails              enable row level security;
alter table public.trail_items         enable row level security;

drop policy if exists "auth_all_methodology_sources" on public.methodology_sources;
create policy "auth_all_methodology_sources" on public.methodology_sources
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "own_trail_plans" on public.trail_plans;
create policy "own_trail_plans" on public.trail_plans
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "own_trails" on public.trails;
create policy "own_trails" on public.trails
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "own_trail_items" on public.trail_items;
create policy "own_trail_items" on public.trail_items
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- ── realtime: a tela do plano observa o status da geração ao vivo ──────────
alter publication supabase_realtime add table public.trail_plans;

-- ── seed: as 7 fontes de metodologia (conteúdo coletado depois, pela UI) ───
insert into public.methodology_sources (title, url, position)
select v.title, v.url, v.position
from (values
  ('Sales Methodology Metrics',      'https://federicopresicci.com/blog/sales-methodology/sales-methodology-metrics/',      0),
  ('RICE Prioritisation Framework',  'https://federicopresicci.com/blog/sales-enablement/rice-prioritisation-framework/',   1),
  ('Deal Coaching',                  'https://federicopresicci.com/blog/sales-coaching/deal-coaching/',                     2),
  ('Sales Games (Gamification)',     'https://federicopresicci.com/blog/sales/sales-games/',                                3),
  ('AI in Sales Enablement',         'https://federicopresicci.com/blog/sales-enablement/ai-in-sales-enablement/',          4),
  ('SPICED Sales Methodology',       'https://www.salesenablementcollective.com/spiced-sales-methodology/',                 5),
  ('Sales Roleplay Scenarios',       'https://federicopresicci.com/blog/sales-training/sales-roleplay-scenarios/',          6)
) as v(title, url, position)
where not exists (select 1 from public.methodology_sources m where m.url = v.url);
