import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getStripe, stripeConfigured } from '@/lib/stripe'
import { plinthError } from '@/lib/errors'
import { publicEnv } from '@/lib/env'

/** Stripe Customer Portal session — SPEC §4, guard O{owner,admin}. */
export async function POST() {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')
  if (!stripeConfigured()) {
    return plinthError('PLINTH_VALIDATION', 'Billing is not configured in this environment')
  }

  const supabase = createClient()
  const { data: org } = await supabase
    .from('organisations')
    .select('stripe_customer_id')
    .eq('id', ctx.organisationId)
    .single()
  if (!org?.stripe_customer_id) {
    return plinthError('PLINTH_NO_SUBSCRIPTION', 'No billing account yet — start a subscription first')
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${publicEnv().hubUrl}/billing`,
  })
  return NextResponse.json({ url: session.url })
}
