-- Migration 0004 — billing and entitlements (SPEC §2)

create table subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  organisation_id             uuid not null references organisations(id) on delete cascade,
  app_id                      uuid not null references apps(id),
  stripe_subscription_id      text,
  stripe_subscription_item_id text,
  status                      text not null
                              check (status in ('trialing','active','past_due','cancelled')),
  seats                       int not null default 1 check (seats >= 1),
  trial_ends_at               timestamptz,
  current_period_end          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (organisation_id, app_id)
);
create trigger subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

create table entitlements (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  app_id          uuid not null references apps(id),
  user_id         uuid not null references auth.users(id) on delete cascade,
  source          text not null check (source in ('subscription','trial','admin_grant')),
  granted_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (organisation_id, app_id, user_id)
);
create index entitlements_user_idx on entitlements (user_id);

-- seat-capacity guard: assignments cannot exceed purchased seats
create or replace function check_seat_capacity() returns trigger
language plpgsql as $$
declare cap int; used int;
begin
  if new.source = 'admin_grant' then return new; end if;
  select seats into cap from subscriptions
    where organisation_id = new.organisation_id and app_id = new.app_id
      and status in ('trialing','active');
  if cap is null then raise exception 'PLINTH_NO_SUBSCRIPTION'; end if;
  select count(*) into used from entitlements
    where organisation_id = new.organisation_id and app_id = new.app_id;
  if used >= cap then raise exception 'PLINTH_SEATS_EXHAUSTED'; end if;
  return new;
end $$;
create trigger entitlements_capacity before insert on entitlements
  for each row execute function check_seat_capacity();

alter table subscriptions enable row level security;
alter table entitlements  enable row level security;

create policy subs_read on subscriptions for select
  using (organisation_id in (select auth_org_ids()));
-- subscription writes: Stripe webhook handlers only (service role).

create policy entitlements_read on entitlements for select
  using (organisation_id in (select auth_org_ids()));
create policy entitlements_manage on entitlements for all
  using (auth_has_org_role(organisation_id, array['owner','admin']))
  with check (auth_has_org_role(organisation_id, array['owner','admin']));
