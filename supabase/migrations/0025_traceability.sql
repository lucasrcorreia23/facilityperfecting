-- Rastreabilidade do roleplay: o que a IA gerou, o que a equipe mudou antes do envio
-- e por que cada calibração foi feita. A linha do tempo da Calibração lê daqui.

-- Saída do ÚLTIMO processamento por IA (reset ou merge: no merge o formulário só
-- preenche campos vazios, mas a saída guardada é a resposta inteira da IA).
alter table public.roleplay_drafts add column if not exists generation_output jsonb;
comment on column public.roleplay_drafts.generation_output is
  'Resposta do último process-import (ProcessImportResult). Comparada com o que foi enviado para mostrar o que a equipe editou à mão.';

-- Cópias no registro do envio, legíveis pela equipe (os rascunhos são own_drafts).
alter table public.roleplay_generations add column if not exists ai_output jsonb;
alter table public.roleplay_generations add column if not exists sent jsonb;
comment on column public.roleplay_generations.ai_output is 'Cópia de roleplay_drafts.generation_output no momento do envio.';
comment on column public.roleplay_generations.sent is 'O que foi enviado, achatado (_shared/generation-diff.ts buildSentSnapshot).';

-- Motivo de cada calibração: o tipo é filtrável, o texto diz qual teste ou pedido.
alter table public.roleplay_adjustments add column if not exists reason_kind text;
alter table public.roleplay_adjustments add column if not exists reason text;
comment on column public.roleplay_adjustments.reason_kind is
  'test_defect | client_request | wrong_data | polish | other (null = salvo antes do campo existir)';
