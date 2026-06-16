-- Limpa os roteiros editados no banco (roleplay_readiness.roteiro) para que os
-- roleplays voltem a usar os textos padrão definidos em app/lib/roleplay-scripts.ts.
--
-- Contexto: resolveRoteiro() usa roleplay_readiness.roteiro quando ele NÃO é nulo;
-- só cai no roteiro estático quando o campo está vazio/nulo. Depois de trocar os
-- textos estáticos, qualquer registro com roteiro salvo continua mostrando a versão
-- antiga até esse campo ser limpo.
--
-- Rode no SQL Editor do Supabase. Execute os passos NA ORDEM.

-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 1 (opcional, recomendado) — Backup dos roteiros atuais antes de limpar.
-- Guarda uma cópia para conseguir reverter, se precisar.
create table if not exists roleplay_readiness_roteiro_backup as
  select id, name, roteiro, now() as backed_up_at
  from public.roleplay_readiness
  where roteiro is not null and btrim(roteiro) <> '';

-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 2 — Pré-visualize o que será afetado (não altera nada).
select id, client_id, name, persona, left(roteiro, 60) as roteiro_preview
from public.roleplay_readiness
where roteiro is not null and btrim(roteiro) <> ''
order by client_id, position;

-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 3 — Limpa os overrides (TODOS os clientes).
-- Depois disso, todos os roleplays passam a exibir o roteiro estático novo.
update public.roleplay_readiness
set roteiro = null,
    updated_at = now()
where roteiro is not null and btrim(roteiro) <> '';

-- ───────────────────────────────────────────────────────────────────────────
-- ALTERNATIVA ao PASSO 3 — Limpar apenas um cliente específico (ex.: RD).
-- Use no lugar do PASSO 3 se quiser preservar overrides de outros clientes.
-- update public.roleplay_readiness rr
-- set roteiro = null, updated_at = now()
-- from public.tracking_clients tc
-- where rr.client_id = tc.id
--   and tc.name = 'RD'                       -- ajuste para o nome do cliente
--   and rr.roteiro is not null and btrim(rr.roteiro) <> '';

-- ───────────────────────────────────────────────────────────────────────────
-- REVERTER (se necessário) — restaura a partir do backup do PASSO 1.
-- update public.roleplay_readiness rr
-- set roteiro = b.roteiro, updated_at = now()
-- from roleplay_readiness_roteiro_backup b
-- where rr.id = b.id;
