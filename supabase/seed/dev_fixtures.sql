-- DEV-ONLY fixtures (SPEC §13). Never apply to prod.
-- Two orgs, five users (one consultant in both), one project each with three
-- documents (one multi-version PDF). Passwords: all users 'plinth-dev-1234'
-- via supabase local auth (inserted directly; local stack only).

-- Users -----------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','j@hannahrail.co.uk',      crypt('plinth-dev-1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"J Hannah"}'),
  ('11111111-1111-4111-8111-111111111102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','site@hannahrail.co.uk',   crypt('plinth-dev-1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Sam Site"}'),
  ('11111111-1111-4111-8111-111111111103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','office@westmoor.co.uk',   crypt('plinth-dev-1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Wes Moor"}'),
  ('11111111-1111-4111-8111-111111111104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','qs@westmoor.co.uk',       crypt('plinth-dev-1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Quinn Surveyor"}'),
  ('11111111-1111-4111-8111-111111111105','00000000-0000-0000-0000-000000000000','authenticated','authenticated','consult@bothorgs.co.uk',  crypt('plinth-dev-1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Casey Consultant"}')
on conflict (id) do nothing;

insert into profiles (id, full_name) values
  ('11111111-1111-4111-8111-111111111101','J Hannah'),
  ('11111111-1111-4111-8111-111111111102','Sam Site'),
  ('11111111-1111-4111-8111-111111111103','Wes Moor'),
  ('11111111-1111-4111-8111-111111111104','Quinn Surveyor'),
  ('11111111-1111-4111-8111-111111111105','Casey Consultant')
on conflict (id) do nothing;

-- Organisations ----------------------------------------------------------
insert into organisations (id, name, slug) values
  ('22222222-2222-4222-8222-222222222201','Hannah Rail Ltd','hannah-rail'),
  ('22222222-2222-4222-8222-222222222202','Westmoor Civils','westmoor-civils')
on conflict (id) do nothing;

insert into organisation_members (organisation_id, user_id, role) values
  ('22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111101','owner'),
  ('22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111102','member'),
  ('22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111105','viewer'),
  ('22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111103','owner'),
  ('22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111104','admin'),
  ('22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111105','member')
on conflict do nothing;

-- Projects + documents ----------------------------------------------------
insert into projects (id, organisation_id, name, reference, created_by) values
  ('33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','Marsh Lane Bridge Renewal','HR-2026-014','11111111-1111-4111-8111-111111111101'),
  ('33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222202','A61 Drainage Improvements','WC-1188','11111111-1111-4111-8111-111111111103')
on conflict (id) do nothing;

insert into project_members (project_id, organisation_id, user_id, role) values
  ('33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111101','lead'),
  ('33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111102','contributor'),
  ('33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111105','viewer'),
  ('33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111103','lead'),
  ('33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111104','contributor'),
  ('33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111105','contributor')
on conflict do nothing;

-- Hannah Rail: three documents, first is a multi-version PDF
insert into documents (id, project_id, organisation_id, name, created_by) values
  ('44444444-4444-4444-8444-444444444401','33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','GA Drawing — Deck Plan.pdf','11111111-1111-4111-8111-111111111101'),
  ('44444444-4444-4444-8444-444444444402','33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','Method Statement — Piling.pdf','11111111-1111-4111-8111-111111111102'),
  ('44444444-4444-4444-8444-444444444403','33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','Site Photos — Week 3.zip','11111111-1111-4111-8111-111111111102'),
  ('44444444-4444-4444-8444-444444444404','33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222202','Drainage Layout.pdf','11111111-1111-4111-8111-111111111103'),
  ('44444444-4444-4444-8444-444444444405','33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222202','CBR Test Results.pdf','11111111-1111-4111-8111-111111111104'),
  ('44444444-4444-4444-8444-444444444406','33333333-3333-4333-8333-333333333302','22222222-2222-4222-8222-222222222202','Traffic Management Plan.pdf','11111111-1111-4111-8111-111111111104')
on conflict (id) do nothing;

insert into document_versions (id, document_id, organisation_id, version_number, storage_path, file_size_bytes, mime_type, uploaded_by) values
  ('55555555-5555-4555-8555-555555555501','44444444-4444-4444-8444-444444444401','22222222-2222-4222-8222-222222222201',1,'org_22222222-2222-4222-8222-222222222201/project_33333333-3333-4333-8333-333333333301/doc_44444444-4444-4444-8444-444444444401/v1/ga-deck-plan.pdf',1048576,'application/pdf','11111111-1111-4111-8111-111111111101'),
  ('55555555-5555-4555-8555-555555555502','44444444-4444-4444-8444-444444444401','22222222-2222-4222-8222-222222222201',2,'org_22222222-2222-4222-8222-222222222201/project_33333333-3333-4333-8333-333333333301/doc_44444444-4444-4444-8444-444444444401/v2/ga-deck-plan.pdf',2097152,'application/pdf','11111111-1111-4111-8111-111111111101')
on conflict (id) do nothing;

update documents set current_version_id = '55555555-5555-4555-8555-555555555502'
  where id = '44444444-4444-4444-8444-444444444401';
