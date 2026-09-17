-- Planos de Ação: schema Supabase (tabelas prefixadas pa_)
-- Rode este arquivo inteiro no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists pa_projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  criado_em timestamptz not null default now()
);

create table if not exists pa_etapas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references pa_projetos(id) on delete cascade,
  ordem int not null,
  titulo text not null,
  descricao text,
  prazo_sugerido text,
  responsaveis text[] not null default '{}',
  observacoes text,
  prazo date,
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado','andamento','concluido')),
  atualizado_em timestamptz not null default now()
);

create table if not exists pa_documentos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references pa_projetos(id) on delete cascade,
  nome_arquivo text not null,
  versao int not null,
  arquivo_url text not null,
  tamanho_bytes bigint,
  enviado_por text,
  enviado_em timestamptz not null default now(),
  resumo_mudancas text
);

alter table pa_projetos enable row level security;
alter table pa_etapas enable row level security;
alter table pa_documentos enable row level security;

create policy "pa_projetos_all" on pa_projetos for all using (true) with check (true);
create policy "pa_etapas_all" on pa_etapas for all using (true) with check (true);
create policy "pa_documentos_all" on pa_documentos for all using (true) with check (true);

-- Storage: crie o bucket "pa_documentos" (público) pela UI do Supabase
-- (Storage > New bucket > nome: pa_documentos > Public bucket: ON), depois rode:
insert into storage.buckets (id, name, public)
values ('pa_documentos', 'pa_documentos', true)
on conflict (id) do nothing;

create policy "pa_documentos_read" on storage.objects for select
  using (bucket_id = 'pa_documentos');
create policy "pa_documentos_insert" on storage.objects for insert
  with check (bucket_id = 'pa_documentos');

-- Seed: projeto "Saneamento do Cadastro de Produtos" com as 7 etapas originais
insert into pa_projetos (id, nome, descricao)
values ('11111111-1111-1111-1111-111111111111',
  'Saneamento do Cadastro de Produtos',
  'Diagnóstico, padronização e governança contínua do cadastro de produtos.')
on conflict (id) do nothing;

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

insert into pa_etapas (projeto_id, ordem, titulo, descricao, prazo_sugerido)
select '11111111-1111-1111-1111-111111111111', v.ordem, v.titulo, v.descricao, v.prazo_sugerido
from (values
  (1, 'Diagnóstico e priorização', 'Levantar e classificar os itens sem movimentação por família e criticidade.', '2 semanas'),
  (2, 'Definir setores centralizadores e regras', 'Formalizar Fiscal, Almoxarifado e Compras como solicitantes autorizados, com SLA e alçada definidos.', '1 semana'),
  (3, 'Revisar o formato padrão', 'Ajustar os campos técnicos obrigatórios e reforçar o uso no fluxo do ERP.', '1 semana'),
  (4, 'Treinamento robusto', 'Capacitar as pessoas autorizadas nos três setores centralizadores.', '2 semanas'),
  (5, 'Reagrupamento e saneamento em lotes', 'Reclassificar os itens por família/categoria e aplicar a regra automática de bloqueio.', '4 semanas'),
  (6, 'Rollout geral', 'Tornar o novo processo obrigatório para todas as solicitações.', '1 semana'),
  (7, 'Monitoramento contínuo', 'Acompanhar indicadores e ajustar a governança do cadastro.', 'Contínuo')
) as v(ordem, titulo, descricao, prazo_sugerido)
where not exists (
  select 1 from pa_etapas where projeto_id = '11111111-1111-1111-1111-111111111111' and ordem = v.ordem
);
