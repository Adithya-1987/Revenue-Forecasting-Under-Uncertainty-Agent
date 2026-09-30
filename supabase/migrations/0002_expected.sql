-- Analytic expected value per result: the number attribution walks between runs.
alter table forecast_results add column if not exists expected numeric(14, 2);
