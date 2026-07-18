-- Prontidão: observação "o que falta" por critério (preenchida quando Parcial).
alter table public.roleplay_readiness
  add column if not exists note_prompt  text,
  add column if not exists note_roteiro text,
  add column if not exists note_teste   text;
