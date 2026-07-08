import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * Stripe webhooks — SPEC §6, event by event. Idempotency first: seen event
 * ids in stripe_events are skipped. Signature always verified. Unknown
 * events log and 200 — never 500 on the unknown.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })

  const signature = request.headers.get('stripe-signature') ?? ''
  const payload = await request.text()

  let event: Stripe.Event
  try {
    event = await getStripe().webhooks.constructEventAsync(payload, signature, secret)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Idempotency: primary-key insert. ONLY a unique-violation (23505) means
  // already-processed → ack. Any other insert error is transient — 500 so
  // Stripe retries, rather than acking (and permanently dropping) the event.
  const { error: claimErr } = await admin.from('stripe_events').insert({ id: event.id })
  if (claimErr) {
    if (claimErr.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error('stripe_events claim failed (transient)', event.id, claimErr)
    return NextResponse.json({ error: 'claim failed' }, { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(admin, event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(admin, event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_failed':
        await onPaymentFailed(admin, event.data.object as Stripe.Invoice)
        break
      case 'invoice.paid':
        await onInvoicePaid(admin, event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.trial_will_end':
        await onTrialWillEnd(admin, event.data.object as Stripe.Subscription)
        break
      default:
        console.log('stripe: unhandled event', event.type)
    }
  } catch (err) {
    // Processing failure: release the idempotency claim so Stripe's retry
    // can reprocess, then 500 to trigger that retry.
    console.error('stripe webhook handler failed', event.type, err)
    await admin.from('stripe_events').delete().eq('id', event.id)
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function getOrgAdminEmails(
  admin: SupabaseClient,
  orgId: string,
  roles: string[] = ['owner', 'admin'],
): Promise<string[]> {
  const { data: members } = await admin
    .from('organisation_members')
    .select('user_id')
    .eq('organisation_id', orgId)
    .in('role', roles)
  const emails: string[] = []
  for (const m of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id)
    if (data.user?.email) emails.push(data.user.email)
  }
  return emails
}

async function orgName(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from('organisations').select('name').eq('id', orgId).single()
  return data?.name ?? 'your organisation'
}

/** checkout.session.completed → upsert subscription active, org active. */
async function onCheckoutCompleted(admin: SupabaseClient, session: Stripe.Checkout.Session) {
  const orgId = session.client_reference_id
  const appId = session.metadata?.app_id
  if (!orgId || !appId) throw new Error('checkout.session.completed missing org/app refs')

  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  let seats = 1
  let itemId: string | null = null
  let periodEnd: string | null = null
  if (subId) {
    const sub = await getStripe().subscriptions.retrieve(subId)
    seats = sub.items.data[0]?.quantity ?? 1
    itemId = sub.items.data[0]?.id ?? null
    periodEnd = new Date(sub.current_period_end * 1000).toISOString()
  }

  await admin.from('subscriptions').upsert(
    {
      organisation_id: orgId,
      app_id: appId,
      stripe_subscription_id: subId,
      stripe_subscription_item_id: itemId,
      status: 'active',
      seats,
      trial_ends_at: null,
      current_period_end: periodEnd,
    },
    { onConflict: 'organisation_id,app_id' },
  )
  await admin.from('organisations').update({ billing_status: 'active' }).eq('id', orgId)
  await logAudit({
    organisationId: orgId,
    actorUserId: null,
    actorType: 'system',
    action: 'billing.subscription_started',
    targetType: 'app',
    targetId: appId,
    metadata: { seats, stripe_subscription_id: subId },
  })
}

/** customer.subscription.updated → sync status/seats/period; over-capacity → flag + email, never auto-unassign. */
async function onSubscriptionUpdated(admin: SupabaseClient, sub: Stripe.Subscription) {
  const { data: row } = await admin
    .from('subscriptions')
    .select('id, organisation_id, app_id, seats')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()
  if (!row) {
    console.log('stripe: subscription.updated for unknown subscription', sub.id)
    return
  }

  const statusMap: Record<string, string> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    unpaid: 'past_due',
    canceled: 'cancelled',
    incomplete: 'past_due',
    incomplete_expired: 'cancelled',
    paused: 'past_due',
  }
  const seats = sub.items.data[0]?.quantity ?? row.seats
  await admin
    .from('subscriptions')
    .update({
      status: statusMap[sub.status] ?? 'active',
      seats,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    })
    .eq('id', row.id)

  const { count: assigned } = await admin
    .from('entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', row.organisation_id)
    .eq('app_id', row.app_id)

  const { data: org } = await admin
    .from('organisations')
    .select('name, settings')
    .eq('id', row.organisation_id)
    .single()
  const settings = { ...((org?.settings as Record<string, unknown>) ?? {}) }

  if ((assigned ?? 0) > seats) {
    await admin
      .from('organisations')
      .update({ settings: { ...settings, seats_over_capacity: true } })
      .eq('id', row.organisation_id)
    const { data: app } = await admin.from('apps').select('name').eq('id', row.app_id).single()
    const emails = await getOrgAdminEmails(admin, row.organisation_id)
    if (emails.length) {
      await sendEmail('seats_over_capacity', emails, {
        orgName: org?.name,
        appName: app?.name,
        detail: `${assigned} people are assigned; the subscription now covers ${seats}.`,
      })
    }
  } else if (settings.seats_over_capacity) {
    // Back within capacity (seats added, or assignments dropped) → clear the
    // sticky flag so the §5 over-capacity banner doesn't latch forever.
    delete settings.seats_over_capacity
    await admin.from('organisations').update({ settings }).eq('id', row.organisation_id)
  }

  await logAudit({
    organisationId: row.organisation_id,
    actorUserId: null,
    actorType: 'system',
    action: 'billing.subscription_updated',
    targetType: 'subscription',
    targetId: row.id,
    metadata: { status: sub.status, seats },
  })
}

/** customer.subscription.deleted → cancelled; entitlements kept, launch blocked; data untouched. */
async function onSubscriptionDeleted(admin: SupabaseClient, sub: Stripe.Subscription) {
  const { data: row } = await admin
    .from('subscriptions')
    .select('id, organisation_id, app_id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()
  if (!row) return
  await admin.from('subscriptions').update({ status: 'cancelled' }).eq('id', row.id)
  await logAudit({
    organisationId: row.organisation_id,
    actorUserId: null,
    actorType: 'system',
    action: 'billing.subscription_cancelled',
    targetType: 'subscription',
    targetId: row.id,
  })
}

/** invoice.payment_failed → past_due + 14-day dunning clock + email owner. */
async function onPaymentFailed(admin: SupabaseClient, invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return
  const { data: org } = await admin
    .from('organisations')
    .select('id, name, settings')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (!org) return

  await admin
    .from('organisations')
    .update({
      billing_status: 'past_due',
      settings: { ...(org.settings ?? {}), dunning_started_at: new Date().toISOString() },
    })
    .eq('id', org.id)

  const owners = await getOrgAdminEmails(admin, org.id, ['owner'])
  if (owners.length) {
    await sendEmail('payment_failed', owners, { orgName: org.name })
  }
  await logAudit({
    organisationId: org.id,
    actorUserId: null,
    actorType: 'system',
    action: 'billing.payment_failed',
  })
}

/** invoice.paid while past_due → restore active; clear dunning. */
async function onInvoicePaid(admin: SupabaseClient, invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return
  const { data: org } = await admin
    .from('organisations')
    .select('id, name, billing_status, settings')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (!org || org.billing_status !== 'past_due') return

  const settings = { ...(org.settings ?? {}) }
  delete (settings as Record<string, unknown>).dunning_started_at
  await admin
    .from('organisations')
    .update({ billing_status: 'active', settings })
    .eq('id', org.id)

  const owners = await getOrgAdminEmails(admin, org.id, ['owner'])
  if (owners.length) await sendEmail('subscription_restored', owners, { orgName: org.name })
  await logAudit({
    organisationId: org.id,
    actorUserId: null,
    actorType: 'system',
    action: 'billing.restored',
  })
}

/** trial_will_end (3 days out) → conversion nudge. */
async function onTrialWillEnd(admin: SupabaseClient, sub: Stripe.Subscription) {
  const { data: row } = await admin
    .from('subscriptions')
    .select('organisation_id, app_id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()
  if (!row) return
  const { data: app } = await admin.from('apps').select('name').eq('id', row.app_id).single()
  const emails = await getOrgAdminEmails(admin, row.organisation_id)
  if (emails.length) {
    await sendEmail('trial_ending_3d', emails, {
      orgName: await orgName(admin, row.organisation_id),
      appName: app?.name,
    })
  }
}
