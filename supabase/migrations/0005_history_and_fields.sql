-- Stage-change and close-date history (append-only), plus model outputs kept per snapshot.
create table if not exists stage_events (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  deal_id text not null, from_stage text, to_stage text not null, changed_at date not null
);
create index if not exists stage_events_deal_idx on stage_events (workspace_id, deal_id, changed_at);
create table if not exists closedate_events (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  deal_id text not null, old_date date, new_date date not null, changed_at date not null
);
create index if not exists closedate_events_deal_idx on closedate_events (workspace_id, deal_id, changed_at);
alter table forecast_deal_snapshots add column if not exists slip_prob numeric(6, 4);
alter table forecast_deal_snapshots add column if not exists days_in_stage int;
alter table forecast_deal_snapshots add column if not exists age_days int;
alter table forecast_results add column if not exists cash_risk jsonb;
alter table stage_events enable row level security;
alter table closedate_events enable row level security;
