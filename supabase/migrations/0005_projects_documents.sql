-- Migration 0005 — projects, folders, documents, quotas (SPEC §2)

create table projects (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 160),
  reference       text,
  description     text not null default '',
  status          text not null default 'active' check (status in ('active','archived')),
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger projects_updated before update on projects
  for each row execute function set_updated_at();
create index projects_org_idx on projects (organisation_id, status);
create index projects_name_trgm on projects using gin (name gin_trgm_ops);

create table project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('lead','contributor','viewer')),
  unique (project_id, user_id)
);
create index project_members_user_idx on project_members (user_id);

create or replace function auth_can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.id = p_project
      and ( auth_has_org_role(p.organisation_id, array['owner','admin'])
            or exists (select 1 from project_members pm
                       where pm.project_id = p.id and pm.user_id = auth.uid()) )
  );
$$;

create table folders (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  parent_id       uuid references folders(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  created_at      timestamptz not null default now(),
  unique (project_id, parent_id, name)
);

create table documents (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  organisation_id    uuid not null references organisations(id) on delete cascade,
  folder_id          uuid references folders(id) on delete set null,
  name               text not null,
  description        text not null default '',
  current_version_id uuid,                    -- FK added after document_versions exists
  deleted_at         timestamptz,             -- soft delete; purge after 30 days (cron)
  created_by         uuid not null references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger documents_updated before update on documents
  for each row execute function set_updated_at();
create index documents_project_idx on documents (project_id) where deleted_at is null;
create index documents_name_trgm on documents using gin (name gin_trgm_ops);

create table document_versions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references documents(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  version_number  int not null,
  storage_path    text not null,   -- org_{org}/project_{proj}/doc_{doc}/v{n}/{filename}
  file_size_bytes bigint not null check (file_size_bytes between 1 and 524288000), -- 500 MB
  mime_type       text not null,
  checksum_sha256 text,
  uploaded_by     uuid not null references auth.users(id),
  uploaded_at     timestamptz not null default now(),
  unique (document_id, version_number)
);
alter table documents add constraint documents_current_version_fk
  foreign key (current_version_id) references document_versions(id) deferrable;

-- storage accounting on the organisation row
create or replace function maintain_storage_used() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update organisations set storage_used_bytes = storage_used_bytes + new.file_size_bytes
      where id = new.organisation_id;
  elsif tg_op = 'DELETE' then
    update organisations set storage_used_bytes = greatest(0, storage_used_bytes - old.file_size_bytes)
      where id = old.organisation_id;
  end if;
  return coalesce(new, old);
end $$;
create trigger versions_storage after insert or delete on document_versions
  for each row execute function maintain_storage_used();

-- ===== RLS =====
alter table projects          enable row level security;
alter table project_members   enable row level security;
alter table folders           enable row level security;
alter table documents         enable row level security;
alter table document_versions enable row level security;

create policy projects_select on projects for select using (auth_can_see_project(id));
create policy projects_insert on projects for insert
  with check (auth_has_org_role(organisation_id, array['owner','admin','member']));
create policy projects_update on projects for update
  using (auth_has_org_role(organisation_id, array['owner','admin'])
         or exists (select 1 from project_members pm
                    where pm.project_id = projects.id and pm.user_id = auth.uid()
                      and pm.role = 'lead'));

create policy pmembers_select on project_members for select using (auth_can_see_project(project_id));
create policy pmembers_manage on project_members for all
  using (auth_has_org_role(organisation_id, array['owner','admin'])
         or exists (select 1 from project_members pm
                    where pm.project_id = project_members.project_id
                      and pm.user_id = auth.uid() and pm.role = 'lead'))
  with check (organisation_id in (select auth_org_ids()));

create policy folders_all on folders for all
  using (auth_can_see_project(project_id))
  with check (auth_can_see_project(project_id));

create policy documents_select on documents for select using (auth_can_see_project(project_id));
create policy documents_write on documents for insert
  with check (auth_can_see_project(project_id)
              and not exists (select 1 from project_members pm
                              where pm.project_id = documents.project_id
                                and pm.user_id = auth.uid() and pm.role = 'viewer'));
create policy documents_update on documents for update using (auth_can_see_project(project_id));

create policy versions_select on document_versions for select
  using (exists (select 1 from documents d where d.id = document_id
                 and auth_can_see_project(d.project_id)));
-- version INSERT happens via the upload server action (service role) after
-- permission + quota + MIME checks; never directly from the client.
