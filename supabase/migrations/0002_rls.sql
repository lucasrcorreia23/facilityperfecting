-- RLS — uso interno (você + CEO). Linhas próprias por created_by; connections
-- compartilhadas entre usuários autenticados (catálogo de orgs da Perfecting).

alter table public.connections           enable row level security;
alter table public.sources               enable row level security;
alter table public.offers                enable row level security;
alter table public.contexts              enable row level security;
alter table public.roleplay_drafts       enable row level security;
alter table public.offer_perfecting_ids  enable row level security;
alter table public.context_perfecting_ids enable row level security;
alter table public.export_jobs           enable row level security;
alter table public.app_settings          enable row level security;

-- Linhas próprias (CRUD) ----------------------------------------------------
create policy "own_sources" on public.sources
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "own_offers" on public.offers
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "own_contexts" on public.contexts
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "own_drafts" on public.roleplay_drafts
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "own_export_jobs" on public.export_jobs
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "own_app_settings" on public.app_settings
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Pontes de id: dono da offer/context controla (via subselect) --------------
create policy "own_offer_perfecting_ids" on public.offer_perfecting_ids
  for all using (
    exists (select 1 from public.offers o where o.id = offer_id and o.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.offers o where o.id = offer_id and o.created_by = auth.uid())
  );

create policy "own_context_perfecting_ids" on public.context_perfecting_ids
  for all using (
    exists (select 1 from public.contexts c where c.id = context_id and c.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.contexts c where c.id = context_id and c.created_by = auth.uid())
  );

-- Connections: catálogo compartilhado entre usuários autenticados -----------
create policy "auth_read_connections" on public.connections
  for select using (auth.role() = 'authenticated');

create policy "auth_write_connections" on public.connections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- NOTA: as Edge Functions usam a SERVICE ROLE KEY, que ignora RLS — podem
-- ler/gravar qualquer linha (necessário no export server-side).
