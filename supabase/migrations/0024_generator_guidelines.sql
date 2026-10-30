-- Versionamento do gerador (process-import).
--
-- 1) Diretrizes da equipe: texto que entra no prompt do gerador DEPOIS das regras
--    fixas do código (que prevalecem em conflito). Cada salvar vira uma versão nova
--    e imutável; restaurar = inserir uma versão nova com o texto da antiga.
--    Escopo: global, modo (methodology|playbook) ou conta. A conta é uma lista de
--    connection ids porque o mesmo cliente tem uma conexão HML e outra PROD.
-- 2) Quem gerou o quê: cada roleplay enviado para a conta guarda o manifesto do
--    gerador (versão, impressão digital, diretrizes usadas). Legível pela equipe toda
--    (os rascunhos são "own_drafts"), gravado pelas Edge Functions de envio.

create table if not exists public.generator_guidelines (
  id          uuid primary key default gen_random_uuid(),
  -- roleplay_import hoje; "playbook" fica reservado para o generate-playbook.
  target      text not null default 'roleplay_import',
  scope_type  text not null,
  scope_keys  text[] not null default '{}',
  title       text not null,
  position    integer not null default 0,
  active      boolean not null default true,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (target in ('roleplay_import', 'playbook')),
  check (scope_type in ('global', 'mode', 'connection')),
  check (scope_type <> 'global' or cardinality(scope_keys) = 0),
  check (scope_type = 'global' or cardinality(scope_keys) > 0)
);

create table if not exists public.generator_guideline_versions (
  id                       uuid primary key default gen_random_uuid(),
  guideline_id             uuid not null references public.generator_guidelines(id) on delete cascade,
  version_no               integer not null,
  body                     text not null,
  note                     text,  -- por que mudou
  restored_from_version_no integer,
  created_by               uuid references auth.users(id) default auth.uid(),
  created_at               timestamptz not null default now(),
  unique (guideline_id, version_no)
);

create index if not exists generator_guideline_versions_guideline_idx
  on public.generator_guideline_versions (guideline_id, version_no desc);

-- version_no sequencial por diretriz. Dois salvamentos simultâneos: o unique recusa um.
create or replace function public.next_guideline_version_no()
returns trigger language plpgsql as $$
begin
  select coalesce(max(version_no), 0) + 1 into new.version_no
    from public.generator_guideline_versions
   where guideline_id = new.guideline_id;
  return new;
end;
$$;

drop trigger if exists trg_guideline_version_no on public.generator_guideline_versions;
create trigger trg_guideline_version_no before insert on public.generator_guideline_versions
  for each row execute function public.next_guideline_version_no();

drop trigger if exists trg_generator_guidelines_updated_at on public.generator_guidelines;
create trigger trg_generator_guidelines_updated_at before update on public.generator_guidelines
  for each row execute function public.set_updated_at();

-- Versão vigente de cada diretriz (a de maior version_no).
create or replace view public.generator_guidelines_current
  with (security_invoker = true) as
  select g.*,
         v.id         as version_id,
         v.version_no,
         v.body,
         v.note,
         v.created_by as version_created_by,
         v.created_at as version_created_at
    from public.generator_guidelines g
    join lateral (
      select * from public.generator_guideline_versions
       where guideline_id = g.id
       order by version_no desc
       limit 1
    ) v on true;

alter table public.generator_guidelines         enable row level security;
alter table public.generator_guideline_versions enable row level security;

-- Equipe toda lê e cria; diretriz muda só título/ordem/ativo; versões nunca mudam
-- nem somem (sem policy de update/delete).
drop policy if exists "read_generator_guidelines" on public.generator_guidelines;
create policy "read_generator_guidelines" on public.generator_guidelines
  for select using (auth.role() = 'authenticated');
drop policy if exists "insert_generator_guidelines" on public.generator_guidelines;
create policy "insert_generator_guidelines" on public.generator_guidelines
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "update_generator_guidelines" on public.generator_guidelines;
create policy "update_generator_guidelines" on public.generator_guidelines
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "read_generator_guideline_versions" on public.generator_guideline_versions;
create policy "read_generator_guideline_versions" on public.generator_guideline_versions
  for select using (auth.role() = 'authenticated');
drop policy if exists "insert_generator_guideline_versions" on public.generator_guideline_versions;
create policy "insert_generator_guideline_versions" on public.generator_guideline_versions
  for insert with check (auth.role() = 'authenticated');

-- Manifesto no rascunho: o process-import devolve, a Criação grava no insert.
alter table public.roleplay_drafts add column if not exists generator jsonb;
comment on column public.roleplay_drafts.generator is
  'Manifesto do gerador que produziu o conteúdo (process-import): version, fingerprint, model, mode, guidelines[]. null = rascunho sem processamento por IA ou anterior ao versionamento.';

create table if not exists public.roleplay_generations (
  id             uuid primary key default gen_random_uuid(),
  connection_id  uuid not null references public.connections(id) on delete cascade,
  case_setup_id  integer not null,
  draft_id       uuid references public.roleplay_drafts(id) on delete set null,
  generator      jsonb,
  export_version text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (connection_id, case_setup_id)
);

alter table public.roleplay_generations enable row level security;

drop policy if exists "read_roleplay_generations" on public.roleplay_generations;
create policy "read_roleplay_generations" on public.roleplay_generations
  for select using (auth.role() = 'authenticated');
