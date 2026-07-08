import 'server-only'
import Stripe from 'stripe'

let cached: Stripe | null = null

/** Lazy Stripe client — only routes under api/billing and api/webhooks use it. */
export function getStripe(): Stripe {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    cached = new Stripe(key, { apiVersion: '2024-06-20' })
  }
  return cached
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}
