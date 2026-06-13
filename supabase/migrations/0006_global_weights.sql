-- Pesos dos critérios do IPR passam a ser globais (por usuário), em app_settings,
-- em vez de por cliente (tracking_clients). Aplicados a todos os roleplays na
-- tela de Prontidão e editados na tela de Configurações.

alter table public.app_settings
  add column if not exists weight_prompt  numeric not null default 0.30,
  add column if not exists weight_roteiro numeric not null default 0.40,
  add column if not exists weight_teste   numeric not null default 0.30;
