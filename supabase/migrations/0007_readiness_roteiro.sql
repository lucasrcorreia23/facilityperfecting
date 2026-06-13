-- Roteiro editável por roleplay. Quando vazio, a UI cai no roteiro padrão
-- (estático, por código) definido em app/lib/roleplay-scripts.ts.

alter table public.roleplay_readiness
  add column if not exists roteiro text;
