-- Migration 0009 — storage bucket + policies, trial start RPC, member-email
-- helper. Keeps the service-role quarantine tight: trials and member email
-- lookups run as security-definer functions under the caller's auth context
-- instead of widening the §4.6 allowlist.

-- ===== Storage bucket (SPEC §2 "Storage bucket policy") ====================
-- Path convention (load-bearing):
--   org_{organisation_id}/project_{project_id}/doc_{document_id}/v{n}/{filename}
-- Policies mirror auth_can_see_project by parsing the path prefix, but the
-- app never relies on them alone — uploads/downloads flow through server
-- actions that verify permission and mint short-lived signed URLs.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('project-documents', 'project-documents', false)
    on conflict (id) do nothing;

    execute $pol$
      create policy "project_documents_read" on storage.objects for select
      using (
        bucket_id = 'project-documents'
        and split_part(name, '/', 2) like 'project_%'
        and auth_can_see_project(replace(split_part(name, '/', 2), 'project_', '')::uuid)
      )
    $pol$;
    -- No client-side insert/update/delete policies: writes go through the
    -- upload server action (service role) after quota + MIME checks.
  end if;
end $$;

-- ===== start_trial: 14-day trial + first seat, atomically ==================
-- SPEC §4 /api/billing/trial — O{owner,admin,member*}: members may
-- self-start when the org setting allows it.
create or replace function start_trial(p_org uuid, p_app_slug text)
returns table (subscription_id uuid, trial_ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_app apps%rowtype;
  v_user uuid := auth.uid();
  v_allowed boolean;
  v_sub subscriptions%rowtype;
begin
  if v_user is null then raise exception 'PLINTH_AUTH_REQUIRED'; end if;

  select * into v_app from apps where slug = p_app_slug and status in ('live','beta');
  if not found then raise exception 'PLINTH_APP_NOT_AVAILABLE'; end if;

  v_allowed := auth_has_org_role(p_org, array['owner','admin'])
    or ( auth_has_org_role(p_org, array['member'])
         and coalesce((select (settings->>'member_trials')::boolean
                       from organisations where id = p_org), true) );
  if not v_allowed then raise exception 'PLINTH_FORBIDDEN'; end if;

  if exists (select 1 from subscriptions
             where organisation_id = p_org and app_id = v_app.id) then
    raise exception 'PLINTH_VALIDATION' using detail = 'trial_already_used';
  end if;

  insert into subscriptions (organisation_id, app_id, status, seats, trial_ends_at)
  values (p_org, v_app.id, 'trialing', 1, now() + interval '14 days')
  returning * into v_sub;

  insert into entitlements (organisation_id, app_id, user_id, source)
  values (p_org, v_app.id, v_user, 'trial');

  perform log_audit(p_org, v_user, 'user', 'billing.trial_started',
                    'app', v_app.slug, jsonb_build_object('trial_ends_at', v_sub.trial_ends_at));

  update organisations set billing_status = 'trialing'
    where id = p_org and billing_status = 'free';

  return query select v_sub.id, v_sub.trial_ends_at;
end $$;

-- ===== Member emails for org members (People page, notifications) ==========
-- profiles carries no email; auth.users is closed to clients. Co-members may
-- already see each other's profiles, so exposing emails org-internally is
-- consistent with existing policy.
create or replace function org_member_emails(p_org uuid)
returns table (user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text
  from auth.users u
  join organisation_members m on m.user_id = u.id
  where m.organisation_id = p_org
    and exists (select 1 from organisation_members me
                where me.organisation_id = p_org and me.user_id = auth.uid())
$$;
