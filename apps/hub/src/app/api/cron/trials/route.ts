import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { cronAuthorised } from '@/lib/cron'
import { plinthError } from '@/lib/errors'

/**
 * Trial expiry — SPEC §4 cron. Hub-managed (card-free) trials that have
 * passed trial_ends_at become cancelled: launch blocks, data untouched.
 * Stripe-managed trials convert via webhooks instead and are skipped here.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorised(request)) return plinthError('PLINTH_FORBIDDEN')

  const admin = createAdminClient()
  const { data: expired } = await admin
    .from('subscriptions')
    .select('id, organisation_id, app_id, apps(name), organisations(name)')
    .eq('status', 'trialing')
    .is('stripe_subscription_id', null)
    .lt('trial_ends_at', new Date().toISOString())
    .limit(200)

  let ended = 0
  for (const sub of expired ?? []) {
    const { error } = await admin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', sub.id)
    if (error) continue
    ended += 1

    await logAudit({
      organisationId: sub.organisation_id,
      actorUserId: null,
      actorType: 'system',
      action: 'billing.trial_ended',
      targetType: 'subscription',
      targetId: sub.id,
    })

    const { data: owners } = await admin
      .from('organisation_members')
      .select('user_id')
      .eq('organisation_id', sub.organisation_id)
      .in('role', ['owner', 'admin'])
    for (const o of owners ?? []) {
      const { data } = await admin.auth.admin.getUserById(o.user_id)
      if (data.user?.email) {
        await sendEmail('trial_ended', data.user.email, {
          orgName: (sub.organisations as unknown as { name: string })?.name,
          appName: (sub.apps as unknown as { name: string })?.name,
        })
      }
    }
  }
  // 3-day conversion nudge for Hub-managed (card-free) trials — SPEC §8
  // trial_ending_3d. Stripe-managed trials get this via the
  // customer.subscription.trial_will_end webhook instead. trial_nudge_sent_at
  // makes it idempotent across daily runs.
  const in3d = new Date(Date.now() + 3 * 86400000).toISOString()
  const in4d = new Date(Date.now() + 4 * 86400000).toISOString()
  const { data: ending } = await admin
    .from('subscriptions')
    .select('id, organisation_id, apps(name), organisations(name)')
    .eq('status', 'trialing')
    .is('stripe_subscription_id', null)
    .is('trial_nudge_sent_at', null)
    .gte('trial_ends_at', in3d)
    .lt('trial_ends_at', in4d)
    .limit(200)

  let nudged = 0
  for (const sub of ending ?? []) {
    const { error } = await admin
      .from('subscriptions')
      .update({ trial_nudge_sent_at: new Date().toISOString() })
      .eq('id', sub.id)
      .is('trial_nudge_sent_at', null) // guard against a concurrent run
    if (error) continue
    nudged += 1
    const { data: owners } = await admin
      .from('organisation_members')
      .select('user_id')
      .eq('organisation_id', sub.organisation_id)
      .in('role', ['owner', 'admin'])
    for (const o of owners ?? []) {
      const { data } = await admin.auth.admin.getUserById(o.user_id)
      if (data.user?.email) {
        await sendEmail('trial_ending_3d', data.user.email, {
          orgName: (sub.organisations as unknown as { name: string })?.name,
          appName: (sub.apps as unknown as { name: string })?.name,
        })
      }
    }
  }

  return NextResponse.json({ ok: true, ended, nudged })
}
