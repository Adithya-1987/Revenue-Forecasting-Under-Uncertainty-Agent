-- Multi-company: workspaces, members, import log; every data table scoped by workspace_id.
-- (Applied via MCP as "workspaces_multitenancy"; see that migration for the full statement list.)
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create table if not exists workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);
create table if not exists imports (
  id bigserial primary key,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default now(),
  source text not null check (source in ('csv', 'sample')),
  filename text, rows int not null default 0, created int not null default 0,
  updated int not null default 0, missing int not null default 0
);
-- data tables gain workspace_id (not null, cascade) and composite keys (workspace_id, id);
-- forbid_change() allows DELETE only when the session sets app.allow_reset = 'on'.
-- created_by nullable (built-in sample workspaces have no creator)
alter table workspaces alter column created_by drop not null;
