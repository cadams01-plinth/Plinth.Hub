-- Seat-capacity trigger behaviour (SPEC §2 migration 0004; feeds AT-05).
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- Fixtures (service-role context: tests run as postgres, RLS bypassed)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'seat-test-1@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'seat-test-2@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'seat-test-3@example.test');

insert into organisations (id, name, slug) values
  ('00000000-0000-4000-8000-00000000000a', 'Seat Test Org', 'seat-test-org');

insert into apps (id, slug, name, category, one_liner, status) values
  ('00000000-0000-4000-8000-00000000000b', 'seat-test-app', 'Seat Test', 'test', 't', 'live');

-- No subscription yet → PLINTH_NO_SUBSCRIPTION
select throws_ok(
  $$ insert into entitlements (organisation_id, app_id, user_id, source)
     values ('00000000-0000-4000-8000-00000000000a',
             '00000000-0000-4000-8000-00000000000b',
             '00000000-0000-4000-8000-000000000001', 'subscription') $$,
  'PLINTH_NO_SUBSCRIPTION');

insert into subscriptions (organisation_id, app_id, status, seats) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'active', 2);

select lives_ok(
  $$ insert into entitlements (organisation_id, app_id, user_id, source)
     values ('00000000-0000-4000-8000-00000000000a',
             '00000000-0000-4000-8000-00000000000b',
             '00000000-0000-4000-8000-000000000001', 'subscription') $$,
  'first seat assigns');

select lives_ok(
  $$ insert into entitlements (organisation_id, app_id, user_id, source)
     values ('00000000-0000-4000-8000-00000000000a',
             '00000000-0000-4000-8000-00000000000b',
             '00000000-0000-4000-8000-000000000002', 'subscription') $$,
  'second seat assigns');

-- Third assignment exceeds the 2-seat cap → PLINTH_SEATS_EXHAUSTED
select throws_ok(
  $$ insert into entitlements (organisation_id, app_id, user_id, source)
     values ('00000000-0000-4000-8000-00000000000a',
             '00000000-0000-4000-8000-00000000000b',
             '00000000-0000-4000-8000-000000000003', 'subscription') $$,
  'PLINTH_SEATS_EXHAUSTED');

select * from finish();
rollback;
