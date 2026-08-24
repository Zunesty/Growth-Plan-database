-- Client Hub: Supabase schema. Real relational tables (not the JSONB-per-row
-- pattern used elsewhere in this app) — this tool's schema is genuinely
-- relational, per explicit decision. Mirrors zunesty-missioncontrol's
-- SQLite schema (src/db.js) almost 1:1; deviations are Postgres-native
-- improvements (declared FK cascades instead of app-level null-outs, jsonb
-- instead of TEXT for proposals.payload_json, numeric for money columns).
--
-- All 7 tables are created now, even though `client_hub_proposals` stays
-- empty until the AI-sweep phase and several tasks/recurring columns aren't
-- populated until the Slack phase — so the schema never needs reworking.
--
-- No seed data — real clients/team get entered through the dashboard.

create table if not exists public.client_hub_team (
  id serial primary key,
  name text not null,
  slack_user_id text,
  role text
);

create table if not exists public.client_hub_clients (
  id serial primary key,
  name text not null,
  slack_channel_id text,
  slack_channel_name text,
  active boolean not null default true,
  sort_order integer not null default 0,
  stage text not null default 'onboarding'
    check (stage in ('onboarding','icp_brief','campaign_build','live','optimizing')),
  stage_entered_at timestamptz,
  owner_id integer references public.client_hub_team(id) on delete set null,
  mrr numeric,
  gross_profit numeric,
  performance text,
  start_date date,
  opt_out_date date,
  renewal_date date,
  relationship text check (relationship in ('Strong','Moderate','Weak')),
  delivery_results text check (delivery_results in ('Strong','Moderate','Weak')),
  churn_risk text check (churn_risk in ('Low','Medium','High')),
  account_type text check (account_type in ('SMB','Mid-Market','Enterprise')),
  ar_risk text check (ar_risk in ('Current','Past Due')),
  contract_url text,
  amendment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_hub_recurring (
  id serial primary key,
  client_id integer references public.client_hub_clients(id),
  title text not null,
  details text,
  assignee_id integer references public.client_hub_team(id) on delete set null,
  due_rule text not null,           -- 'day:25' | 'last_weekday' | 'weekday:mon'
  lead_time_days integer not null default 5,
  active boolean not null default true
);

create table if not exists public.client_hub_tasks (
  id serial primary key,
  client_id integer references public.client_hub_clients(id),
  title text not null,
  details text,
  assignee_id integer references public.client_hub_team(id) on delete set null,
  status text not null default 'todo'
    check (status in ('todo','in_progress','qc','completed')),
  due_date date,
  source text,                      -- slack_command|slack_shortcut|dashboard|api|sweep|recurring|slack_mention
  slack_permalink text,
  recurring_template_id integer references public.client_hub_recurring(id) on delete set null,
  revision_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists client_hub_tasks_status_idx on public.client_hub_tasks(status);
create index if not exists client_hub_tasks_client_idx on public.client_hub_tasks(client_id);

create table if not exists public.client_hub_activity_log (
  id serial primary key,
  task_id integer references public.client_hub_tasks(id) on delete cascade,
  actor text,
  action text not null check (action in ('created','status_change','revision','updated')),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists client_hub_activity_task_idx on public.client_hub_activity_log(task_id);

create table if not exists public.client_hub_proposals (
  id serial primary key,
  kind text not null check (kind in ('new_task','status_change')),
  payload_json jsonb not null,
  client_id integer references public.client_hub_clients(id),
  status text not null default 'open' check (status in ('open','approved','dismissed')),
  slack_message_ts text,
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz
);
create index if not exists client_hub_proposals_status_idx on public.client_hub_proposals(status);

create table if not exists public.client_hub_onboarding_items (
  id serial primary key,
  client_id integer not null references public.client_hub_clients(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort_order integer not null default 0
);
create index if not exists client_hub_onboarding_client_idx on public.client_hub_onboarding_items(client_id);

-- ─── Row-level security ─────────────────────────────────────────────────
-- Same posture as every other table in this app: no login system, anon key
-- used from server routes only, RLS is a formality not an access boundary.
do $$
declare t text;
begin
  foreach t in array array[
    'client_hub_team','client_hub_clients','client_hub_recurring',
    'client_hub_tasks','client_hub_activity_log','client_hub_proposals',
    'client_hub_onboarding_items'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s: anon all" on public.%I;', t, t);
    execute format(
      'create policy "%s: anon all" on public.%I for all to anon, authenticated using (true) with check (true);',
      t, t
    );
  end loop;
end $$;
