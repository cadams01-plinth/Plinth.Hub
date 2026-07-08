import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, stripeConfigured } from '@/lib/stripe'
import { cronAuthorised } from '@/lib/cron'
import { plinthError } from '@/lib/errors'

/**
 * Nightly Stripe reconciliation — SPEC §6: diff Stripe subscriptions against
 * ours; self-heal STATUS drift only; NEVER self-heal seat drift (human
 * review); alert on anything found.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorised(request)) return plinthError('PLINTH_FORBIDDEN')
  if (!stripeConfigured()) return NextResponse.json({ ok: true, skipped: 'stripe not configured' })

  const admin = createAdminClient()
  const stripe = getStripe()
  const { data: rows } = await admin
    .from('subscriptions')
    .select('id, organisation_id, status, seats, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)

  const statusMap: Record<string, string> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    unpaid: 'past_due',
    canceled: 'cancelled',
    incomplete_expired: 'cancelled',
  }

  const drift: { id: string; kind: string; ours: string | number; theirs: string | number }[] = []
  let healed = 0
  for (const row of rows ?? []) {
    let remote
    try {
      remote = await stripe.subscriptions.retrieve(row.stripe_subscription_id!)
    } catch {
      drift.push({ id: row.id, kind: 'missing_in_stripe', ours: row.status, theirs: 'absent' })
      continue
    }
    const remoteStatus = statusMap[remote.status] ?? 'active'
    if (remoteStatus !== row.status) {
      await admin.from('subscriptions').update({ status: remoteStatus }).eq('id', row.id)
      drift.push({ id: row.id, kind: 'status_healed', ours: row.status, theirs: remoteStatus })
      healed += 1
    }
    const remoteSeats = remote.items.data[0]?.quantity ?? row.seats
    if (remoteSeats !== row.seats) {
      // Seat drift is NEVER self-healed — flag for a human (SPEC §6).
      drift.push({ id: row.id, kind: 'seat_drift', ours: row.seats, theirs: remoteSeats })
    }
  }

  if (drift.length > 0) {
    // Sentry picks this up server-side; the log line is the alert trigger.
    console.error('stripe reconciliation drift', JSON.stringify(drift))
  }
  return NextResponse.json({ ok: true, checked: rows?.length ?? 0, healed, drift })
}
