-- Histórico da tela "Ajustar roleplay": cada aba salva num roleplay que já está na
-- Perfecting vira uma linha com o antes e o depois. Serve para saber quem mudou o
-- quê e para desfazer à mão (a tela mostra o valor anterior para copiar).
-- Quem grava é a Edge Function `adjust-roleplay` (service role); o front só lê.
--
-- before/after: o formato da aba em `supabase/functions/_shared/roleplay-adjust-model.ts`
-- (AdjustSections[section]). summary: frases curtas do que foi feito.

create table if not exists public.roleplay_adjustments (
  id             uuid primary key default gen_random_uuid(),
  connection_id  uuid not null references public.connections(id) on delete cascade,
  case_setup_id  integer not null,
  section        text not null,  -- general|prior_knowledge|step_knowledge|objections|persona|guardrails|regenerate
  before         jsonb,
  after          jsonb,
  summary        jsonb not null default '[]'::jsonb,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists roleplay_adjustments_case_setup_idx
  on public.roleplay_adjustments (connection_id, case_setup_id, created_at desc);

alter table public.roleplay_adjustments enable row level security;

-- Leitura para a equipe toda (o cadastro é fechado); escrita só pela service role.
drop policy if exists "read_roleplay_adjustments" on public.roleplay_adjustments;
create policy "read_roleplay_adjustments" on public.roleplay_adjustments
  for select using (auth.role() = 'authenticated');
