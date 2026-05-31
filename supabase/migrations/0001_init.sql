-- Gerador externo de roleplays — schema inicial (v1: MVP + reuso + lote).
-- Espelha §6 dos docs em facility/, com pontes de id POR conexão (reuso multi-org).

-- ── connections: cada org (conta de cliente) da Perfecting ────────────────
create table if not exists public.connections (
  id                    uuid primary key default gen_random_uuid(),
  environment           text not null default 'hml',          -- 'hml' | 'prod'
  org_id                integer not null,                     -- target_organization_id
  org_name              text,
  target_user_id        integer,                              -- gestor da org (login_as_user)
  default_user_group_id integer,
  created_at            timestamptz not null default now(),
  unique (environment, org_id)
);

-- ── sources: import bruto (v1: paste | file) ──────────────────────────────
create table if not exists public.sources (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                                  -- 'paste' | 'file'
  raw_text    text,
  file_path   text,                                           -- Storage (bucket 'imports')
  meta        jsonb not null default '{}'::jsonb,             -- { filename, mime, ... }
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ── offers: biblioteca local de ofertas (reutilizáveis) ───────────────────
create table if not exists public.offers (
  id                  uuid primary key default gen_random_uuid(),
  offer_name          text not null,
  general_description text not null,
  url                 text,
  source_id           uuid references public.sources(id) on delete set null,
  status              text not null default 'draft',
  created_by          uuid references auth.users(id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── contexts: biblioteca local de contextos (reutilizáveis) ───────────────
create table if not exists public.contexts (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references public.offers(id) on delete cascade,
  name          text,
  target_notes  text,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── roleplay_drafts: o rascunho que vai para a Perfecting ─────────────────
create table if not exists public.roleplay_drafts (
  id                       uuid primary key default gen_random_uuid(),
  offer_id                 uuid not null references public.offers(id) on delete cascade,
  context_id               uuid references public.contexts(id) on delete set null,
  connection_id            uuid references public.connections(id),  -- destino do export
  scenario                 jsonb not null default '{}'::jsonb,      -- { call_context_slug, difficulty, skill, objective }
  title                    text,
  status                   text not null default 'draft',           -- draft|exporting|exported|error
  perfecting_case_setup_id integer,
  elevenlabs_agent_id      text,
  error_detail             jsonb,
  created_by               uuid references auth.users(id) default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── pontes de id POR conexão (reuso multi-org) ────────────────────────────
-- Uma oferta criada na org A NÃO existe na org B → id da Perfecting por conexão.
create table if not exists public.offer_perfecting_ids (
  offer_id            uuid not null references public.offers(id) on delete cascade,
  connection_id       uuid not null references public.connections(id) on delete cascade,
  perfecting_offer_id integer not null,
  created_at          timestamptz not null default now(),
  primary key (offer_id, connection_id)
);

create table if not exists public.context_perfecting_ids (
  context_id            uuid not null references public.contexts(id) on delete cascade,
  connection_id         uuid not null references public.connections(id) on delete cascade,
  perfecting_context_id integer not null,
  created_at            timestamptz not null default now(),
  primary key (context_id, connection_id)
);

-- ── export_jobs: auditoria/fila do export (lote) ──────────────────────────
create table if not exists public.export_jobs (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references public.roleplay_drafts(id) on delete cascade,
  state        text not null default 'queued',                -- queued|running|done|error
  step         text,                                          -- offer|context|case_setup
  attempts     integer not null default 0,
  error_detail jsonb,
  created_by   uuid references auth.users(id) default auth.uid(),
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ── app_settings: defaults globais (linha única por usuário) ──────────────
create table if not exists public.app_settings (
  id                        uuid primary key default gen_random_uuid(),
  default_difficulty        text default 'medium',
  default_call_context_slug text,
  environment               text not null default 'hml',
  default_user_group_id     integer,
  created_by                uuid references auth.users(id) default auth.uid() unique,
  updated_at                timestamptz not null default now()
);

-- ── índices úteis ─────────────────────────────────────────────────────────
create index if not exists idx_contexts_offer on public.contexts(offer_id);
create index if not exists idx_drafts_offer on public.roleplay_drafts(offer_id);
create index if not exists idx_drafts_status on public.roleplay_drafts(status);
create index if not exists idx_export_jobs_draft on public.export_jobs(draft_id);

-- ── trigger updated_at ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['offers','contexts','roleplay_drafts','app_settings']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on public.%1$s;
       create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;
