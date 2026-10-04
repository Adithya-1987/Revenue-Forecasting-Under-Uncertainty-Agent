-- Render free tier sleeps after 15 min idle, and GitHub cron runs hours late.
-- Supabase pings the API's /health every 5 min instead.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'keep-render-warm',
  '*/5 * * * *',
  $$select net.http_get('https://revenue-forecasting-under-uncertainty.onrender.com/health', timeout_milliseconds := 60000)$$
);
