-- Migração: histórico de quem mudou o status de cada etapa + checklist de sub-itens
-- Rode isto no SQL Editor do Supabase.

create table if not exists pa_etapa_historico (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references pa_etapas(id) on delete cascade,
  status_anterior text,
  status_novo text not null,
  feito_por text,
  feito_em timestamptz not null default now()
);

alter table pa_etapa_historico enable row level security;
create policy "pa_etapa_historico_all" on pa_etapa_historico for all using (true) with check (true);

create table if not exists pa_checklist (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references pa_etapas(id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

alter table pa_checklist enable row level security;
create policy "pa_checklist_all" on pa_checklist for all using (true) with check (true);
