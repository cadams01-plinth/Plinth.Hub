-- Migration 0012 — tenancy hardening: composite (child, organisation_id)
-- foreign keys.
--
-- SPEC §2 denormalises organisation_id onto folders/documents/
-- document_versions/project_members so RLS predicates stay fast. But nothing
-- binds that denormalised org to the parent's org: the pmembers_manage /
-- documents_write RLS with-checks validate organisation_id membership alone,
-- not that project_id actually belongs to it. That let a document or
-- project-member row be stamped with an org different from its project's —
-- a cross-tenant hazard (AT-03). These composite FKs make the mismatch
-- impossible at the database level, independent of RLS or route code.
--
-- Existing single-column FKs stay; these are additive. Seed + dev fixtures
-- already satisfy them (every child row shares its parent's org).

-- Parents need a unique key on (id, organisation_id) to be referenced.
alter table projects  add constraint projects_id_org_key  unique (id, organisation_id);
alter table documents add constraint documents_id_org_key unique (id, organisation_id);

-- Children must share their parent's organisation_id.
alter table project_members
  add constraint project_members_project_org_fk
  foreign key (project_id, organisation_id)
  references projects (id, organisation_id) on delete cascade;

alter table folders
  add constraint folders_project_org_fk
  foreign key (project_id, organisation_id)
  references projects (id, organisation_id) on delete cascade;

alter table documents
  add constraint documents_project_org_fk
  foreign key (project_id, organisation_id)
  references projects (id, organisation_id) on delete cascade;

alter table document_versions
  add constraint document_versions_document_org_fk
  foreign key (document_id, organisation_id)
  references documents (id, organisation_id) on delete cascade;
