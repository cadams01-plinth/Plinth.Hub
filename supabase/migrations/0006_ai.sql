-- Migration 0006 — AI (SPEC §2)

create table ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null default 'New conversation',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create table ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool')),
  content         jsonb not null,
  tokens_in       int not null default 0,
  tokens_out      int not null default 0,
  created_at      timestamptz not null default now()
);
create table ai_usage_daily (
  organisation_id uuid not null references organisations(id) on delete cascade,
  day             date not null,
  tokens_in       bigint not null default 0,
  tokens_out      bigint not null default 0,
  actions_executed int not null default 0,
  primary key (organisation_id, day)
);

alter table ai_conversations enable row level security;
alter table ai_messages      enable row level security;
alter table ai_usage_daily   enable row level security;

create policy ai_conv_own on ai_conversations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid()
    and organisation_id in (select auth_org_ids()));
create policy ai_msg_own on ai_messages for select
  using (exists (select 1 from ai_conversations c
                 where c.id = conversation_id and c.user_id = auth.uid()));
create policy ai_usage_admin_read on ai_usage_daily for select
  using (auth_has_org_role(organisation_id, array['owner','admin']));
