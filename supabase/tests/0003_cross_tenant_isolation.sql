-- AT-03 (partial) — cross-tenant isolation at the database layer.
-- Runs under `supabase test db`. Two orgs, two owners; asserts that acting as
-- org A's user you cannot SEE org B's projects/documents (RLS), and that the
-- composite FKs (migration 0012) reject any attempt to stamp a child row with
-- an org different from its project's — the exact class of bug the route-layer
-- fixes also guard.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- ===== Fixtures (as superuser; RLS bypassed for setup) =====
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@iso.test'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'owner-b@iso.test');

insert into organisations (id, name, slug) values
  ('aaaaaaaa-0000-4000-8000-0000000000aa', 'Iso Org A', 'iso-org-a'),
  ('bbbbbbbb-0000-4000-8000-0000000000bb', 'Iso Org B', 'iso-org-b');

insert into organisation_members (organisation_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000aa', 'aaaaaaaa-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-0000000000bb', 'bbbbbbbb-0000-4000-8000-000000000001', 'owner');

insert into projects (id, organisation_id, name, created_by) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'A Project', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-0000000000bb', 'B Project', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into documents (id, project_id, organisation_id, name, created_by) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'A Doc', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-0000000000bb', 'B Doc', 'bbbbbbbb-0000-4000-8000-000000000001');

-- ===== Act as org A's owner =====
set local role authenticated;
set local request.jwt.claim.sub to 'aaaaaaaa-0000-4000-8000-000000000001';
set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}';

-- 1. Sees own project
select is(
  (select count(*)::int from projects where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  1, 'org A owner sees org A project');

-- 2. Cannot see org B's project
select is(
  (select count(*)::int from projects where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'),
  0, 'org A owner cannot see org B project');

-- 3. Cannot see org B's document
select is(
  (select count(*)::int from documents where id = 'bbbbbbbb-0000-4000-8000-0000000000d1'),
  0, 'org A owner cannot see org B document');

-- 4. Composite FK: cannot insert a project_member into org B's project even
--    stamped with org A (the escalation the route fix also blocks).
select throws_ok(
  $$ insert into project_members (project_id, organisation_id, user_id, role)
     values ('bbbbbbbb-0000-4000-8000-0000000000b1',
             'aaaaaaaa-0000-4000-8000-0000000000aa',
             'aaaaaaaa-0000-4000-8000-000000000001', 'lead') $$,
  '23503', 'composite FK rejects project_member with foreign project + own org');

-- 5. Composite FK: cannot create a document in org B's project stamped org A.
select throws_ok(
  $$ insert into documents (project_id, organisation_id, name, created_by)
     values ('bbbbbbbb-0000-4000-8000-0000000000b1',
             'aaaaaaaa-0000-4000-8000-0000000000aa',
             'sneaky', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '23503', 'composite FK rejects document with foreign project + own org');

-- 6. Matching org is still allowed (no false positive on legitimate writes).
select lives_ok(
  $$ insert into folders (project_id, organisation_id, name)
     values ('aaaaaaaa-0000-4000-8000-0000000000a1',
             'aaaaaaaa-0000-4000-8000-0000000000aa', 'Legit folder') $$,
  'folder in own project + own org still allowed');

reset role;
select * from finish();
rollback;
