-- Deal history: stage moves, close-date changes, value and status changes, logged by the database
-- itself so every writer (CSV import, sample data, scripts) is captured the same way.
--
-- Writers can set, per transaction:
--   app.event_date    'YYYY-MM-DD'  the business date of the change (default: today)
--   app.event_source  'csv' | 'sample' | ...  (default: 'import')
--   app.deal_log      'off'  skip automatic logging (the generator writes full histories itself)

-- When the deal entered its current stage: the basis for time-in-stage.
alter table deals add column if not exists stage_entered_at date;
update deals set stage_entered_at = created_at where stage_entered_at is null;
alter table deals alter column stage_entered_at set not null;

create table if not exists deal_events (
  id            bigserial primary key,
  workspace_id  uuid not null,
  deal_id       text not null,
  at            date not null,
  kind          text not null check (kind in ('created', 'stage', 'close_date', 'value', 'status')),
  from_value    text,
  to_value      text,
  source        text not null default 'import',
  recorded_at   timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references deals (workspace_id, id) on delete cascade
);
create index if not exists deal_events_deal_idx on deal_events (workspace_id, deal_id, at);
create index if not exists deal_events_recent_idx on deal_events (workspace_id, recorded_at desc);
alter table deal_events enable row level security;

-- History is append-only, like forecast snapshots (a workspace reset may still delete).
drop trigger if exists deal_events_immutable on deal_events;
create trigger deal_events_immutable before update or delete on deal_events
  for each row execute function forbid_change();

create or replace function deal_event_date() returns date
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('app.event_date', true), '')::date, current_date)
$$;

-- BEFORE: keep stage_entered_at right. A stage change without an explicit date happened on the event
-- date, or on closed_at when the same change closed the deal.
create or replace function deal_stage_clock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at, new.created_at);
  elsif new.stage is distinct from old.stage and new.stage_entered_at is not distinct from old.stage_entered_at then
    new.stage_entered_at := greatest(
      case when new.status <> old.status and new.closed_at is not null then new.closed_at else public.deal_event_date() end,
      new.created_at);
  end if;
  return new;
end $$;

-- AFTER: append one event per changed field.
create or replace function deal_log_change() returns trigger
language plpgsql set search_path = '' as $$
declare
  d   date := public.deal_event_date();
  src text := coalesce(nullif(current_setting('app.event_source', true), ''), 'import');
begin
  if current_setting('app.deal_log', true) = 'off' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.deal_events (workspace_id, deal_id, at, kind, to_value, source)
    values (new.workspace_id, new.id, new.created_at, 'created', new.stage, src);
    if new.status <> 'open' then
      insert into public.deal_events (workspace_id, deal_id, at, kind, from_value, to_value, source)
      values (new.workspace_id, new.id, new.closed_at, 'status', 'open', new.status, src);
    end if;
    return null;
  end if;
  if new.stage is distinct from old.stage then
    insert into public.deal_events (workspace_id, deal_id, at, kind, from_value, to_value, source)
    values (new.workspace_id, new.id, new.stage_entered_at, 'stage', old.stage, new.stage, src);
  end if;
  if new.expected_close_date is distinct from old.expected_close_date then
    insert into public.deal_events (workspace_id, deal_id, at, kind, from_value, to_value, source)
    values (new.workspace_id, new.id, d, 'close_date', old.expected_close_date::text, new.expected_close_date::text, src);
  end if;
  if new.value is distinct from old.value then
    insert into public.deal_events (workspace_id, deal_id, at, kind, from_value, to_value, source)
    values (new.workspace_id, new.id, d, 'value', old.value::text, new.value::text, src);
  end if;
  if new.status is distinct from old.status then
    insert into public.deal_events (workspace_id, deal_id, at, kind, from_value, to_value, source)
    values (new.workspace_id, new.id, coalesce(new.closed_at, d), 'status', old.status, new.status, src);
  end if;
  return null;
end $$;

drop trigger if exists deals_stage_clock on deals;
create trigger deals_stage_clock before insert or update on deals
  for each row execute function deal_stage_clock();
drop trigger if exists deals_log_change on deals;
create trigger deals_log_change after insert or update on deals
  for each row execute function deal_log_change();

-- Backfill: deals that predate this migration get their creation (and close) on record.
insert into deal_events (workspace_id, deal_id, at, kind, to_value, source)
select d.workspace_id, d.id, d.created_at, 'created', d.stage, 'backfill' from deals d
 where not exists (select 1 from deal_events e where e.workspace_id = d.workspace_id and e.deal_id = d.id);
insert into deal_events (workspace_id, deal_id, at, kind, from_value, to_value, source)
select d.workspace_id, d.id, d.closed_at, 'status', 'open', d.status, 'backfill' from deals d
 where d.status <> 'open'
   and not exists (select 1 from deal_events e where e.workspace_id = d.workspace_id and e.deal_id = d.id and e.kind = 'status');
