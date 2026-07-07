-- Migration 0001 — foundations, audit, helpers (SPEC §2)
-- Note: the RLS helper functions (auth_org_ids, auth_has_org_role,
-- auth_is_super_admin) live at the end of 0002, per the note in SPEC §2 —
-- their SQL bodies reference tables created there. CI applies 0001+0002 as
-- one release.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";      -- name search

-- updated_at maintenance
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===== AUDIT LOG: first table in the database, append-only, partitioned =====
create table audit_log (
  id              bigint generated always as identity,
  occurred_at     timestamptz not null default now(),
  organisation_id uuid,
  actor_user_id   uuid,
  actor_type      text not null check (actor_type in ('user','super_admin','system','ai')),
  action          text not null,          -- dot-namespaced: 'auth.login', 'document.downloaded'
  target_type     text,
  target_id       text,
  ip              inet,
  user_agent      text,
  metadata        jsonb not null default '{}',
  primary key (id, occurred_at)
) partition by range (occurred_at);

-- monthly partitions; a scheduled job (/api/cron/partitions) creates next
-- month's partition on the 25th (and must enable RLS on it). First three now:
create table audit_log_2026_07 partition of audit_log
  for values from ('2026-07-01') to ('2026-08-01');
create table audit_log_2026_08 partition of audit_log
  for values from ('2026-08-01') to ('2026-09-01');
create table audit_log_2026_09 partition of audit_log
  for values from ('2026-09-01') to ('2026-10-01');

create index audit_log_org_time_idx    on audit_log (organisation_id, occurred_at desc);
create index audit_log_actor_time_idx  on audit_log (actor_user_id, occurred_at desc);
create index audit_log_action_idx      on audit_log (action, occurred_at desc);

alter table audit_log enable row level security;
-- Partitions inherit the parent's policies but carry their own rowsecurity
-- flag; enable it so direct access is closed and the meta-test stays green.
alter table audit_log_2026_07 enable row level security;
alter table audit_log_2026_08 enable row level security;
alter table audit_log_2026_09 enable row level security;

-- Append-only: inserts happen ONLY via the security-definer function below.
-- No update/delete policies exist for anyone; org admins may read their org's
-- log (read policy created in 0002, after the role helpers exist).
revoke all on audit_log from anon, authenticated;

create or replace function log_audit(
  p_org uuid, p_actor uuid, p_actor_type text, p_action text,
  p_target_type text default null, p_target_id text default null,
  p_metadata jsonb default '{}'
) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (organisation_id, actor_user_id, actor_type, action,
                         target_type, target_id, metadata)
  values (p_org, p_actor, p_actor_type, p_action, p_target_type, p_target_id, p_metadata);
$$;
