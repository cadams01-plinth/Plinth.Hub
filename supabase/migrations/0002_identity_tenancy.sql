-- Migration 0002 — identity and tenancy (SPEC §2)

create table organisations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 2 and 120),
  slug                text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  stripe_customer_id  text unique,
  billing_status      text not null default 'free'
                      check (billing_status in ('free','trialing','active','past_due','cancelled')),
  storage_quota_bytes bigint not null default 5368709120,   -- 5 GB free tier
  storage_used_bytes  bigint not null default 0,            -- maintained by trigger (0005)
  ai_enabled          boolean not null default true,
  mfa_required        boolean not null default false,
  settings            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger organisations_updated before update on organisations
  for each row execute function set_updated_at();

create table profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  full_name               text,
  avatar_url              text,
  default_organisation_id uuid references organisations(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

create table organisation_members (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('owner','admin','member','viewer')),
  created_at      timestamptz not null default now(),
  unique (organisation_id, user_id)
);
create index org_members_user_idx on organisation_members (user_id);

create table invitations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('admin','member','viewer')),
  token           text not null unique default encode(gen_random_bytes(24),'hex'),
  invited_by      uuid not null references auth.users(id),
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (organisation_id, email)
);

create table super_admins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ===== RLS helper functions (used by every policy in the database) =====
-- Defined here (not 0001) because their bodies reference the tables above;
-- see the ordering note in SPEC §2.
create or replace function auth_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select organisation_id from organisation_members where user_id = auth.uid();
$$;

create or replace function auth_has_org_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organisation_members
    where organisation_id = p_org and user_id = auth.uid() and role = any(p_roles)
  );
$$;

create or replace function auth_is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from super_admins where user_id = auth.uid());
$$;

-- ===== RLS =====
alter table organisations        enable row level security;
alter table profiles             enable row level security;
alter table organisation_members enable row level security;
alter table invitations          enable row level security;
alter table super_admins         enable row level security;

create policy org_select on organisations for select
  using (id in (select auth_org_ids()) or auth_is_super_admin());
create policy org_update on organisations for update
  using (auth_has_org_role(id, array['owner','admin']))
  with check (auth_has_org_role(id, array['owner','admin']));
-- org INSERT happens via the sign-up server action (service role) only.

create policy profiles_self_select on profiles for select
  using (id = auth.uid()
         or exists (select 1 from organisation_members m1
                    join organisation_members m2 using (organisation_id)
                    where m1.user_id = auth.uid() and m2.user_id = profiles.id));
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

create policy members_select on organisation_members for select
  using (organisation_id in (select auth_org_ids()));
create policy members_manage on organisation_members for all
  using (auth_has_org_role(organisation_id, array['owner','admin']))
  with check (auth_has_org_role(organisation_id, array['owner','admin'])
              and role <> 'owner');          -- owner transfer is a dedicated server action
create policy members_leave on organisation_members for delete
  using (user_id = auth.uid() and role <> 'owner');

create policy invitations_admin on invitations for all
  using (auth_has_org_role(organisation_id, array['owner','admin']))
  with check (auth_has_org_role(organisation_id, array['owner','admin']));
-- invite acceptance resolves by token via server action (service role), never client select.

create policy super_admins_self on super_admins for select
  using (user_id = auth.uid());

-- Deferred from 0001 (needed the role helpers): org admins read their org's audit log.
create policy audit_org_read on audit_log for select
  using (auth_has_org_role(organisation_id, array['owner','admin'])
         or auth_is_super_admin());
grant select on audit_log to authenticated;
