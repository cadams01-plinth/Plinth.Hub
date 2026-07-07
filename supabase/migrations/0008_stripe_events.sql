-- Migration 0008 — Stripe webhook idempotency store (SPEC §6: "store
-- stripe_events(id primary key, processed_at); skip seen ids").
-- Not part of SPEC §2's 0001–0007 set; added here because §6 requires it.

create table stripe_events (
  id           text primary key,          -- Stripe event id (evt_…)
  processed_at timestamptz not null default now()
);

alter table stripe_events enable row level security;
-- Written only by the webhook handler (service role, bypasses RLS).
create policy stripe_events_sa_read on stripe_events for select
  using (auth_is_super_admin());

-- Monthly audit-log partition creation (called by /api/cron/partitions on
-- the 25th; SPEC §2 0001). Enables RLS on the new partition so the tenancy
-- meta-test stays green.
create or replace function create_next_audit_partition() returns text
language plpgsql security definer set search_path = public as $$
declare
  start_month date := date_trunc('month', now() + interval '1 month')::date;
  end_month   date := (date_trunc('month', now() + interval '2 month'))::date;
  part_name   text := 'audit_log_' || to_char(start_month, 'YYYY_MM');
begin
  if not exists (select 1 from pg_tables
                 where schemaname = 'public' and tablename = part_name) then
    execute format(
      'create table %I partition of audit_log for values from (%L) to (%L)',
      part_name, start_month, end_month);
    execute format('alter table %I enable row level security', part_name);
  end if;
  return part_name;
end $$;
revoke all on function create_next_audit_partition() from anon, authenticated;
