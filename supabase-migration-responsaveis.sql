-- Migração: permite mais de um responsável por etapa
-- Rode isto no SQL Editor do Supabase.

alter table pa_etapas add column if not exists responsaveis text[] not null default '{}';

-- Migra o valor antigo (um responsável só) pra lista, se existir
update pa_etapas
set responsaveis = array[responsavel]
where responsavel is not null and responsavel <> '' and responsaveis = '{}';

alter table pa_etapas drop column if exists responsavel;
