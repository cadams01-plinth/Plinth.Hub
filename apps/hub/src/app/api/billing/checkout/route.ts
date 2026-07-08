import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getStripe, stripeConfigured } from '@/lib/stripe'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'
import { publicEnv } from '@/lib/env'

const bodySchema = z.object({
  app_slug: z.string().min(1),
  price_id: z.string().uuid(),
  seats: z.number().int().min(1).max(500),
})

/**
 * Stripe Checkout session for app + price + seats — SPEC §4.
 * Guard O{owner,admin}. Runs entirely under the user's RLS: the org row
 * update (stripe_customer_id) is permitted by org_update.
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')
  if (!stripeConfigured()) {
    return plinthError('PLINTH_VALIDATION', 'Billing is not configured in this environment')
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { app_slug, price_id, seats } = parsed.data

  const supabase = createClient()
  const { data: app } = await supabase
    .from('apps')
    .select('id, slug, name, app_prices(id, stripe_price_id, active)')
    .eq('slug', app_slug)
    .in('status', ['live', 'beta'])
    .maybeSingle()
  if (!app) return plinthError('PLINTH_APP_NOT_AVAILABLE')
  const price = (app.app_prices as { id: string; stripe_price_id: string; active: boolean }[])
    .find((p) => p.id === price_id && p.active)
  if (!price) return plinthError('PLINTH_VALIDATION', 'That price is not available')

  const stripe = getStripe()

  // Ensure the org has a Stripe customer (org_update RLS permits this write).
  const { data: orgRow } = await supabase
    .from('organisations')
    .select('stripe_customer_id, name, slug')
    .eq('id', ctx.organisationId)
    .single()
  let customerId = orgRow?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: orgRow?.name,
      email: ctx.user.email,
      metadata: { organisation_id: ctx.organisationId },
    })
    customerId = customer.id
    await supabase
      .from('organisations')
      .update({ stripe_customer_id: customerId })
      .eq('id', ctx.organisationId)
  }

  const { hubUrl } = publicEnv()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: ctx.organisationId,
    line_items: [{ price: price.stripe_price_id, quantity: seats }],
    subscription_data: { metadata: { organisation_id: ctx.organisationId, app_id: app.id } },
    metadata: { organisation_id: ctx.organisationId, app_id: app.id, app_slug: app.slug },
    success_url: `${hubUrl}/billing?checkout=success`,
    cancel_url: `${hubUrl}/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  })

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'billing.checkout_started',
    targetType: 'app',
    targetId: app.slug,
    metadata: { seats, price_id },
  })

  return NextResponse.json({ url: session.url })
}
