-- Round v4 do cliente RD: renomeia (v3) → (v4), remapeia as personas conforme
-- roteiros_venda_11_roleplays_v4.md e adiciona RP0.0 (Mariana Lopes) e
-- RP A.1 (Eduardo Ramos), totalizando 11 roleplays.
--
-- Os corpos dos roteiros (gabarito v4 por fases) vivem em
-- app/lib/roleplay-scripts.ts, indexados pelo código do nome ("RP1.1 (v4)" → "1.1",
-- "RP A.1 (v4)" → "A.1"). Aqui só ajustamos NOME e PERSONA das linhas; a coluna
-- roteiro fica NULL e a UI cai no roteiro estático por código.
--
-- Escopo: apenas o round de MAIOR position do RD — o "novo round" que herdou os
-- rótulos (v3). O round anterior é preservado como histórico. Idempotente:
-- re-rodar não duplica nada (renames viram no-op; inserts são guardados).

do $$
declare
  rd_id        uuid;
  target_round uuid;
begin
  select id into rd_id
    from public.tracking_clients
   where lower(trim(name)) = 'rd'
   order by created_at
   limit 1;
  if rd_id is null then
    return;
  end if;

  select id into target_round
    from public.evaluation_rounds
   where client_id = rd_id
   order by position desc, created_at desc
   limit 1;
  if target_round is null then
    return;
  end if;

  -- ── Renomeia (v3) → (v4) e remapeia personas no round-alvo ────────────────
  -- Obs.: Renata e Mariana Alves trocam de código (2.1 ⇄ 1.1) entre v3 e v4;
  -- por isso o remap é por código de destino, não por persona herdada.
  update public.roleplay_readiness set name = 'RP1.1 (v4)',
         persona = 'Renata Azevedo — Gerente de Marketing (Fluency Way Idiomas)'
   where round_id = target_round and name = 'RP1.1 (v3)';

  update public.roleplay_readiness set name = 'RP1.2 (v4)',
         persona = 'Ricardo Mendes — Gerente Comercial (crédito bancário)'
   where round_id = target_round and name = 'RP1.2 (v3)';

  update public.roleplay_readiness set name = 'RP1.3 (v4)',
         persona = 'Rodrigo Martins — Diretor Comercial e Marketing (Conecta Saúde Corporativa)'
   where round_id = target_round and name = 'RP1.3 (v3)';

  update public.roleplay_readiness set name = 'RP2.1 (v4)',
         persona = 'Mariana Alves — Gerente de Marketing & Vendas (VitaCorp Saúde Corporativa)'
   where round_id = target_round and name = 'RP2.1 (v3)';

  update public.roleplay_readiness set name = 'RP2.2 (v4)',
         persona = 'Camila Andrade — Gerente de Marketing (Clínica BelleVie Estética)'
   where round_id = target_round and name = 'RP2.2 (v3)';

  update public.roleplay_readiness set name = 'RP2.3 (v4)',
         persona = 'Marcelo Oliveira — Gerente Comercial (SaaS B2B em expansão)'
   where round_id = target_round and name = 'RP2.3 (v3)';

  update public.roleplay_readiness set name = 'RP3.1 (v4)',
         persona = 'João Silva — Coordenador de Marketing (FarmaPrime B2B)'
   where round_id = target_round and name = 'RP3.1 (v3)';

  update public.roleplay_readiness set name = 'RP3.2 (v4)',
         persona = 'Patrícia Salles — Gerente de Marketing & Vendas (VitaCorp Saúde Corporativa)'
   where round_id = target_round and name = 'RP3.2 (v3)';

  update public.roleplay_readiness set name = 'RP3.3 (v4)',
         persona = 'Antônio Ribeiro — Diretor Executivo de Receita (Grupo Evolua Educação)'
   where round_id = target_round and name = 'RP3.3 (v3)';

  -- ── Novos roleplays do round v4 (aquisição / warm-up) ─────────────────────
  insert into public.roleplay_readiness (client_id, round_id, name, persona, position)
  select rd_id, target_round, 'RP0.0 (v4)',
         'Mariana Lopes — Head de Marketing & Vendas (VeloX Tecnologia)', -1
   where not exists (
     select 1 from public.roleplay_readiness
      where round_id = target_round and name = 'RP0.0 (v4)'
   );

  insert into public.roleplay_readiness (client_id, round_id, name, persona, position)
  select rd_id, target_round, 'RP A.1 (v4)',
         'Eduardo Ramos — Gerente Comercial (Nexen Logística)', 9
   where not exists (
     select 1 from public.roleplay_readiness
      where round_id = target_round and name = 'RP A.1 (v4)'
   );
end $$;
