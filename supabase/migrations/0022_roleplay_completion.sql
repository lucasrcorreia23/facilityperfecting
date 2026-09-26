-- Fechamento do roleplay avulso (modo metodologia).
--
-- O envio terminava no case_setup/create e marcava o rascunho como exportado,
-- mas o roleplay nascia sem "# Comportamento", sem "# Conhecimento de Background"
-- e sem metodologia vinculada: o create só grava a linha, monta o case_prompt
-- legado e cria o agente de voz. O resto do ciclo (rubricas, conteúdo por etapa,
-- comportamento) são outros endpoints, que agora rodam na complete-roleplay.
--
-- completion_run guarda o progresso e o veredito desse fechamento:
-- { case_setup_id, context_id, persona_id, methodology_id, methodology_slug,
--   difficulty_level_id, objections_seeded, stage,
--   steps: { <passo>: { status, attempts, started_at, finished_at, detail } },
--   gate, missing[], warnings[], attempt_round, started_at, finished_at }
--
-- Os passos são retomáveis: `attempts` é incrementado ANTES da chamada, para
-- sobreviver à morte da Edge Function (~150s) enquanto a Perfecting continua
-- trabalhando. O poll reconcilia lendo o artefato de cada passo na Perfecting
-- antes de considerar rechamar — nunca reexecuta IA às cegas.
--
-- roleplay_drafts já está na publication de realtime (0004) e as políticas de
-- RLS são por linha (own_*, 0002), então não há RLS nem realtime novo aqui.
alter table roleplay_drafts add column if not exists completion_run jsonb;

-- Metodologia padrão dos envios avulsos, guardada como SLUG (derivado do nome,
-- como default_call_context_slug): o id de metodologia não é portável entre HML
-- e PROD, e um id inexistente derruba o case_setup/create inteiro com 404.
-- Sem metodologia vinculada o conteúdo por etapa sai vazio e o roleplay fica
-- sem "# Conhecimento de Background".
alter table app_settings add column if not exists default_methodology_slug text;

comment on column roleplay_drafts.status is 'draft|exporting|completing|exported|incomplete|error';
comment on column export_jobs.step is 'offer|context|context_content|persona|case_setup';
