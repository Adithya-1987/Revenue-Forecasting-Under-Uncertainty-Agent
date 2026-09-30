-- Rangefinder schema. Browser never talks to these tables directly: RLS is on with no
-- policies, so anon/authenticated are denied; the Node API and Python engine connect
-- as the database owner via SUPABASE_DB_URL.

-- Raw pipeline ---------------------------------------------------------------
create table if not exists customers (
  id                  text primary key,
  name                text not null,
  segment             text not null check (segment in ('SMB', 'Mid-Market', 'Enterprise')),
  payment_terms_days  int  not null default 30,
  region              text
);

create table if not exists salespeople (
  id         text primary key,
  name       text not null,
  team       text,
  hire_date  date
);

-- One row per deal, history and open. push_count / last_activity_date are kept on
-- the deal (no separate event log) to fit the hackathon timebox.
create table if not exists deals (
  id                   text primary key,
  name                 text not null,
  customer_id          text not null references customers (id),
  salesperson_id       text not null references salespeople (id),
  value                numeric(14, 2) not null check (value > 0),
  stage                text not null check (stage in ('Qualify', 'Demo', 'Proposal', 'Negotiation', 'Closed')),
  status               text not null default 'open' check (status in ('open', 'won', 'lost')),
  created_at           date not null,
  expected_close_date  date not null,
  last_activity_date   date not null,
  push_count           int  not null default 0,
  closed_at            date,
  paid_at              date,
  check (status = 'open' or closed_at is not null)
);
create index if not exists deals_status_idx on deals (status);
create index if not exists deals_rep_idx on deals (salesperson_id);

create table if not exists targets (
  horizon_days  int  not null check (horizon_days in (30, 60, 90)),
  basis         text not null check (basis in ('bookings', 'cash')),
  amount        numeric(14, 2) not null,
  primary key (horizon_days, basis)
);

-- Forecast records (immutable) ----------------------------------------------
create table if not exists forecast_runs (
  id             uuid primary key default gen_random_uuid(),
  run_at         timestamptz not null default now(),
  as_of          date not null,
  model_version  text not null default 'v1'
);

create table if not exists forecast_results (
  run_id           uuid not null references forecast_runs (id),
  horizon_days     int  not null,
  basis            text not null,
  p10              numeric(14, 2) not null,
  p50              numeric(14, 2) not null,
  p90              numeric(14, 2) not null,
  mean             numeric(14, 2) not null,
  target           numeric(14, 2),
  prob_hit_target  numeric(5, 4),
  top3_share       numeric(5, 4),
  hhi              numeric(6, 4),
  top_deal         text,
  series           jsonb not null,
  histogram        jsonb not null,
  primary key (run_id, horizon_days, basis)
);

-- Full frozen state of every open deal at each run: what attribution diffs.
create table if not exists forecast_deal_snapshots (
  run_id               uuid not null references forecast_runs (id),
  deal_id              text not null,
  name                 text not null,
  value                numeric(14, 2) not null,
  stage                text not null,
  segment              text not null,
  salesperson_id       text not null,
  p_win                numeric(6, 4) not null,
  p_win_low            numeric(6, 4) not null,
  p_win_high           numeric(6, 4) not null,
  calibration          numeric(6, 4) not null,
  cycle_mu             numeric(8, 4) not null,
  cycle_sigma          numeric(8, 4) not null,
  payment_delay_days   numeric(8, 2) not null,
  expected_close_date  date not null,
  factors              jsonb not null,
  reasons              jsonb not null,
  primary key (run_id, deal_id)
);

create table if not exists forecast_attributions (
  id            bigserial primary key,
  run_id        uuid not null references forecast_runs (id),
  prev_run_id   uuid not null references forecast_runs (id),
  horizon_days  int  not null,
  basis         text not null,
  seq           int  not null,
  cause_type    text not null,
  deal_id       text,
  deal_name     text,
  amount        numeric(14, 2) not null,
  description   text not null
);
create index if not exists forecast_attributions_run_idx on forecast_attributions (run_id, horizon_days, basis);

-- Backtest output for the Trust screen, stored as the API's Accuracy shape.
create table if not exists accuracy_reports (
  id           bigserial primary key,
  computed_at  timestamptz not null default now(),
  report       jsonb not null
);

-- Snapshots are insert-only: block UPDATE and DELETE at the database.
create or replace function forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is immutable: insert a new run instead', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['forecast_runs', 'forecast_results', 'forecast_deal_snapshots', 'forecast_attributions'] loop
    execute format('drop trigger if exists %I_immutable on %I', t, t);
    execute format('create trigger %I_immutable before update or delete on %I for each row execute function forbid_change()', t, t);
  end loop;
end $$;

alter table customers               enable row level security;
alter table salespeople             enable row level security;
alter table deals                   enable row level security;
alter table targets                 enable row level security;
alter table forecast_runs           enable row level security;
alter table forecast_results        enable row level security;
alter table forecast_deal_snapshots enable row level security;
alter table forecast_attributions   enable row level security;
alter table accuracy_reports        enable row level security;
