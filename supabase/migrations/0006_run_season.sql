-- Each forecast run keeps the seasonal clock it was computed on (12 close-rate indices, Jan..Dec), so the
-- explanation of the next run can replay this one exactly. Null means the plain calendar (runs before step 2).
alter table forecast_runs add column if not exists season jsonb
  check (season is null or (jsonb_typeof(season) = 'array' and jsonb_array_length(season) = 12));
