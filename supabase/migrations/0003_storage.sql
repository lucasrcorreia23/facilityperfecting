-- Bucket privado para uploads de import (PDF/DOCX). Áudio fica para fase futura.
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

-- Cada usuário só acessa arquivos dentro da sua "pasta" = auth.uid()/...
create policy "imports_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "imports_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "imports_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
