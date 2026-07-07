-- The tenancy meta-test (SPEC §2) — fails CI if any public table lacks RLS
-- or lacks at least one policy. Runs via `supabase test db` (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

select ok(
  not exists (
    select 1 from pg_tables t
    where t.schemaname = 'public'
      and t.rowsecurity = false
  ), 'every public table has RLS enabled');

select ok(
  not exists (
    select 1 from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t.tablename)
      and t.tablename not like 'audit_log_%'   -- partitions inherit
  ), 'every public table has at least one policy');

select * from finish();
rollback;
