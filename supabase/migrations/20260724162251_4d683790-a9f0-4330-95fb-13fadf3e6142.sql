CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-bi-daily-kpis');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-bi-daily-kpis',
  '15 2 * * *',
  $$SELECT public.refresh_bi_daily_kpis(35);$$
);
