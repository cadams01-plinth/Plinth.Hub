-- Migration 0013 — fix infinite-recursion in the project_members RLS.
--
-- SPEC §2 (0005) wrote pmembers_manage.USING as:
--   auth_has_org_role(...) OR exists (select 1 from project_members pm where ...)
-- The self-select reads project_members from inside a policy ON
-- project_members, so Postgres raises "infinite recursion detected in policy
-- for relation project_members" the moment the table is touched under RLS —
-- which is every real (authenticated) request. It never surfaced in seed/RPC
-- validation because those run as the table owner with RLS bypassed. Symptoms
-- in the app: the project page (selects project_members), document inserts
-- (documents_write reads project_members), and project updates
-- (projects_update reads project_members) all error for signed-in users.
--
-- Fix: move the self-referencing lookup into a SECURITY DEFINER helper — the
-- same pattern the spec already uses for auth_can_see_project — so reads of
-- project_members inside a policy bypass RLS and don't recurse. Behaviour is
-- unchanged: org owners/admins and the project's lead may manage members.

create or replace function auth_is_project_lead(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project and pm.user_id = auth.uid() and pm.role = 'lead'
  );
$$;

-- Rewrite pmembers_manage without the self-select.
drop policy pmembers_manage on project_members;
create policy pmembers_manage on project_members for all
  using (auth_has_org_role(organisation_id, array['owner','admin'])
         or auth_is_project_lead(project_id))
  with check (organisation_id in (select auth_org_ids()));

-- projects_update embedded the same self-pattern (reads project_members from
-- the projects policy). Once pmembers is non-recursive this path is safe, but
-- route it through the helper too for clarity and one indexed lookup.
drop policy projects_update on projects;
create policy projects_update on projects for update
  using (auth_has_org_role(organisation_id, array['owner','admin'])
         or auth_is_project_lead(id));
