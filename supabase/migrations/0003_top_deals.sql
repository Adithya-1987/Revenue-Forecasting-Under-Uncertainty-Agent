-- Top three deals by share of expected revenue, for the concentration strip.
alter table forecast_results add column if not exists top_deals jsonb;
