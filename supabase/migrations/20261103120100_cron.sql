-- Gera os lançamentos previstos das recorrências todo dia às 06:00 UTC (03:00 em Brasília).
-- O pg_cron está disponível em todos os planos do Supabase, inclusive o gratuito.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.schedule(
  'confin-gerar-recorrencias',
  '0 6 * * *',
  $$select public.generate_recurrences(null, 60);$$
);
