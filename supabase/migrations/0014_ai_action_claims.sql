-- Migration 0014 — atomic single-execution for AI act-tools + trial-nudge
-- idempotency.
--
-- /api/ai/confirm guarded double-execution by reading prior role='tool'
-- messages (a check-then-act TOCTOU): two concurrent confirms for the same
-- action_id both pass the read and both execute (two projects, two invites).
-- A dedicated claims table with a UNIQUE action_id makes the claim atomic;
-- the route deletes its claim if execution fails, so retry-after-failure
-- still works.
create table ai_action_claims (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  action_id       uuid not null unique,
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);
alter table ai_action_claims enable row level security;
create policy ai_claims_own on ai_action_claims for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and organisation_id in (select auth_org_ids()));

-- Card-free (Hub-managed) trials never got the §8 trial_ending_3d nudge; the
-- trials cron now sends it. This column makes that idempotent across runs.
alter table subscriptions add column trial_nudge_sent_at timestamptz;
