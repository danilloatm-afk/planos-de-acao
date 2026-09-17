-- Migração: campo para o resumo de mudanças (gerado por IA) em cada versão de documento
-- Rode isto no SQL Editor do Supabase.

alter table pa_documentos add column if not exists resumo_mudancas text;
