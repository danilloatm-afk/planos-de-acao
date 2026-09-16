-- Migração: adiciona a aba "Apresentação" (carrossel de slides por projeto)
-- Rode isto no SQL Editor do Supabase (não precisa rodar o supabase-schema.sql
-- de novo, isto só acrescenta o que falta).

create table if not exists pa_slides (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references pa_projetos(id) on delete cascade,
  ordem int not null,
  imagem_url text not null,
  criado_em timestamptz not null default now()
);

alter table pa_slides enable row level security;

create policy "pa_slides_all" on pa_slides for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('pa_slides', 'pa_slides', true)
on conflict (id) do nothing;

create policy "pa_slides_read" on storage.objects for select
  using (bucket_id = 'pa_slides');
create policy "pa_slides_insert" on storage.objects for insert
  with check (bucket_id = 'pa_slides');
