-- Geração via Anthropic Message Batches: batch pendente por estágio.
-- jsonb: { "id": "msgbatch_...", "stage": "analysis"|"plan", "submitted_at": iso }
-- Null quando não há batch em andamento.
alter table public.trail_plans
  add column if not exists pending_batch jsonb;
