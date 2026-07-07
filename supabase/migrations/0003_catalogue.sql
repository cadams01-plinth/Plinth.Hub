-- Migration 0003 — catalogue (SPEC §2)

create table apps (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name              text not null,
  category          text not null,
  one_liner         text not null,
  description       text not null default '',
  status            text not null default 'coming_soon'
                    check (status in ('live','beta','coming_soon','hidden')),
  app_url           text,                      -- e.g. https://itp.plinthresource.com
  redirect_urls     text[] not null default '{}',  -- allowed SSO callback URLs, exact match
  icon              text,
  screenshots       jsonb not null default '[]',
  sort_order        int not null default 100,
  stripe_product_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger apps_updated before update on apps for each row execute function set_updated_at();

create table app_prices (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references apps(id) on delete cascade,
  stripe_price_id text not null unique,
  billing_interval text not null check (billing_interval in ('month','year')),
  unit_amount_pence int not null check (unit_amount_pence >= 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table apps       enable row level security;
alter table app_prices enable row level security;

-- catalogue readable by everyone signed in; 'hidden' rows super-admin only;
-- the PUBLIC marketing pages read via a server component using anon + a view:
create policy apps_read on apps for select
  using (status <> 'hidden' or auth_is_super_admin());
create policy apps_admin_write on apps for all
  using (auth_is_super_admin()) with check (auth_is_super_admin());
create policy prices_read on app_prices for select using (active = true or auth_is_super_admin());
create policy prices_admin_write on app_prices for all
  using (auth_is_super_admin()) with check (auth_is_super_admin());
