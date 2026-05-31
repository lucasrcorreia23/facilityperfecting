-- Habilita realtime nas tabelas que a Biblioteca observa (status do export ao vivo).
alter publication supabase_realtime add table public.roleplay_drafts;
alter publication supabase_realtime add table public.export_jobs;
