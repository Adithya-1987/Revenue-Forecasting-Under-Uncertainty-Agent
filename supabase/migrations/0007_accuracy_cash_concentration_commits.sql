-- Payment history (all invoices, for per-customer lateness), rep commits (forecast vs actual),
-- slip-into-later-period per deal, and concentration stats per result.
create table if not exists invoice_payments (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  customer_id text not null, invoice_date date not null, due_date date, paid_date date,
  amount numeric(14, 2) not null
);
create index if not exists invoice_payments_ws_idx on invoice_payments (workspace_id, customer_id);
create table if not exists rep_forecasts (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  salesperson_id text not null, period_start date not null, period_end date not null,
  committed numeric(14, 2) not null
);
create index if not exists rep_forecasts_ws_idx on rep_forecasts (workspace_id, salesperson_id, period_start);
alter table forecast_deal_snapshots add column if not exists slip_period_prob numeric(6, 4);
alter table forecast_results add column if not exists concentration jsonb;
alter table invoice_payments enable row level security;
alter table rep_forecasts enable row level security;
