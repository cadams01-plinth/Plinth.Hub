-- Migration 0007 — platform: flags, usage, impersonation (SPEC §2)

create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, description text not null default '',
  enabled_globally boolean not null default false
);
create table organisation_feature_flags (
  organisation_id uuid not null references organisations(id) on delete cascade,
  flag_id uuid not null references feature_flags(id) on delete cascade,
  enabled boolean not null,
  primary key (organisation_id, flag_id)
);
create table usage_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null, user_id uuid, app_id uuid,
  event text not null, occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create index usage_events_org_idx on usage_events (organisation_id, occurred_at desc);

create table impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_id uuid not null references super_admins(id),
  organisation_id uuid not null references organisations(id),
  reason text not null check (char_length(reason) >= 10),
  consent_reference text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  actions_count int not null default 0
);

alter table feature_flags               enable row level security;
alter table organisation_feature_flags  enable row level security;
alter table usage_events                enable row level security;
alter table impersonation_sessions      enable row level security;

create policy flags_read on feature_flags for select using (true);
create policy flags_admin on feature_flags for all
  using (auth_is_super_admin()) with check (auth_is_super_admin());
create policy org_flags_read on organisation_feature_flags for select
  using (organisation_id in (select auth_org_ids()) or auth_is_super_admin());
create policy org_flags_admin on organisation_feature_flags for all
  using (auth_is_super_admin()) with check (auth_is_super_admin());
create policy usage_org_read on usage_events for select
  using (auth_has_org_role(organisation_id, array['owner','admin']) or auth_is_super_admin());
create policy imp_org_visibility on impersonation_sessions for select
  using (auth_has_org_role(organisation_id, array['owner','admin']) or auth_is_super_admin());
-- Transparency by design: org owners SEE when Plinth staff impersonated their org.
