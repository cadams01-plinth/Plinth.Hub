-- Migration 0010 — Ask Plinth support. 0006 defines conversation/message
-- tables but no message INSERT policy and no metering write path for
-- non-admin users; both are added here without widening the service-role
-- quarantine (security definer RPC, caller-scoped).

create policy ai_msg_insert on ai_messages for insert
  with check (
    organisation_id in (select auth_org_ids())
    and exists (select 1 from ai_conversations c
                where c.id = conversation_id and c.user_id = auth.uid())
  );

-- Metering (SPEC §7): increment ai_usage_daily per turn. Caller must belong
-- to the org; totals are readable by org admins via the 0006 policy.
create or replace function meter_ai_usage(
  p_org uuid, p_tokens_in bigint, p_tokens_out bigint, p_actions int default 0
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from organisation_members
                 where organisation_id = p_org and user_id = auth.uid()) then
    raise exception 'PLINTH_FORBIDDEN';
  end if;
  insert into ai_usage_daily (organisation_id, day, tokens_in, tokens_out, actions_executed)
  values (p_org, current_date, p_tokens_in, p_tokens_out, p_actions)
  on conflict (organisation_id, day) do update
    set tokens_in = ai_usage_daily.tokens_in + excluded.tokens_in,
        tokens_out = ai_usage_daily.tokens_out + excluded.tokens_out,
        actions_executed = ai_usage_daily.actions_executed + excluded.actions_executed;
end $$;

-- Today's usage for cap checks (soft 200k tokens/org/day, hard 2×).
create or replace function ai_usage_today(p_org uuid)
returns table (tokens_in bigint, tokens_out bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(u.tokens_in, 0), coalesce(u.tokens_out, 0)
  from (select 1) one
  left join ai_usage_daily u
    on u.organisation_id = p_org and u.day = current_date
  where exists (select 1 from organisation_members
                where organisation_id = p_org and user_id = auth.uid())
$$;
