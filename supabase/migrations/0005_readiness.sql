-- Módulo Prontidão — IPR (Índice de Prontidão de Roleplay) por cliente.
-- Espelha a planilha status_roleplay.xlsx: cada roleplay recebe nota em 3
-- critérios ponderados (Prompt/Roteiro/Teste) → score calculado na aplicação,
-- além de Status manual, Responsável e Observações. KPIs do conjunto na UI.

-- ── tracking_clients: cada cliente acompanhado (RD, etc.) + pesos do IPR ────
create table if not exists public.tracking_clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  weight_prompt   numeric not null default 0.30,
  weight_roteiro  numeric not null default 0.40,
  weight_teste    numeric not null default 0.30,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── roleplay_readiness: uma linha = um roleplay de um cliente ──────────────
create table if not exists public.roleplay_readiness (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.tracking_clients(id) on delete cascade,
  name          text not null,                          -- ex.: 'RP1.1 (v3)'
  persona       text,                                   -- ex.: 'Antônio Ribeiro'
  score_prompt  numeric not null default 0,             -- 0 | 0.5 | 1
  score_roteiro numeric not null default 0,
  score_teste   numeric not null default 0,
  status        text not null default 'nao_iniciado',   -- nao_iniciado|em_andamento|bloqueado|pronto
  responsavel   text,
  observacoes   text,
  position      integer not null default 0,             -- ordenação manual
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_readiness_client on public.roleplay_readiness(client_id);

-- ── trigger updated_at (mesma função public.set_updated_at de 0001_init) ───
do $$
declare t text;
begin
  foreach t in array array['tracking_clients','roleplay_readiness']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on public.%1$s;
       create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS — artefato de equipe compartilhado (padrão de connections) ─────────
alter table public.tracking_clients   enable row level security;
alter table public.roleplay_readiness enable row level security;

drop policy if exists "auth_all_clients" on public.tracking_clients;
create policy "auth_all_clients" on public.tracking_clients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_all_readiness" on public.roleplay_readiness;
create policy "auth_all_readiness" on public.roleplay_readiness
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Seed do cliente RD com os roleplays do print (idempotente) ─────────────
do $$
declare rd_id uuid;
begin
  select id into rd_id from public.tracking_clients where name = 'RD' limit 1;
  if rd_id is null then
    insert into public.tracking_clients (name) values ('RD') returning id into rd_id;

    insert into public.roleplay_readiness (client_id, name, persona, position) values
      (rd_id, 'RP1.1 (v3)', 'Mariana Alves — Head de Marketing & Vendas',      0),
      (rd_id, 'RP1.2 (v3)', 'Ricardo Mendes — Gerente Comercial',              1),
      (rd_id, 'RP1.3 (v3)', 'Rodrigo Martins — Diretor Comercial e Marketing', 2),
      (rd_id, 'RP2.1 (v3)', 'Renata Azevedo — Gerente de Marketing',           3),
      (rd_id, 'RP2.2 (v3)', 'Camila Andrade — Gerente de Marketing',           4),
      (rd_id, 'RP2.3 (v3)', 'Marcelo Oliveira — Gerente Comercial',            5),
      (rd_id, 'RP3.1 (v3)', 'Gustavo Avelar — Coordenador de Marketing',       6),
      (rd_id, 'RP3.2 (v3)', 'Patrícia Salles — Gerente de Marketing & Vendas', 7),
      (rd_id, 'RP3.3 (v3)', 'Antônio Ribeiro — Diretor Executivo de Receita',  8);
  end if;
end $$;
