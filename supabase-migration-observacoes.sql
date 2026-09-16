-- Migração: adiciona campo de observações em cada etapa
-- Rode isto no SQL Editor do Supabase.

alter table pa_etapas add column if not exists observacoes text;
