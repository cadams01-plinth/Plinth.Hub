-- Migration 0011 — read-only super-admin visibility for the admin console
-- (SPEC §5 "Admin org detail: the support cockpit"). Extends the pattern the
-- spec already sets on organisations/feature_flags/usage_events/
-- impersonation_sessions: super admins can SEE, never write, tenant data
-- through their own RLS context. Writes stay quarantined per §4.6.

create policy members_sa_read on organisation_members for select
  using (auth_is_super_admin());
create policy invitations_sa_read on invitations for select
  using (auth_is_super_admin());
create policy subs_sa_read on subscriptions for select
  using (auth_is_super_admin());
create policy entitlements_sa_read on entitlements for select
  using (auth_is_super_admin());
create policy ai_usage_sa_read on ai_usage_daily for select
  using (auth_is_super_admin());
create policy audit_sa_read on audit_log for select
  using (auth_is_super_admin());
