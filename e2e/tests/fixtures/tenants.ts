/**
 * Known seed identities — mirror supabase/seed/dev_fixtures.sql. Tests assume
 * `supabase db reset` has loaded these. All dev users share one password.
 */
export const DEV_PASSWORD = 'plinth-dev-1234'

export const USERS = {
  hannahOwner: { id: '11111111-1111-4111-8111-111111111101', email: 'j@hannahrail.co.uk', name: 'J Hannah' },
  hannahMember: { id: '11111111-1111-4111-8111-111111111102', email: 'site@hannahrail.co.uk', name: 'Sam Site' },
  westmoorOwner: { id: '11111111-1111-4111-8111-111111111103', email: 'office@westmoor.co.uk', name: 'Wes Moor' },
  westmoorAdmin: { id: '11111111-1111-4111-8111-111111111104', email: 'qs@westmoor.co.uk', name: 'Quinn Surveyor' },
  consultant: { id: '11111111-1111-4111-8111-111111111105', email: 'consult@bothorgs.co.uk', name: 'Casey Consultant' },
} as const

export const ORGS = {
  hannahRail: { id: '22222222-2222-4222-8222-222222222201', name: 'Hannah Rail Ltd', slug: 'hannah-rail' },
  westmoor: { id: '22222222-2222-4222-8222-222222222202', name: 'Westmoor Civils', slug: 'westmoor-civils' },
} as const

export const PROJECTS = {
  marshLane: { id: '33333333-3333-4333-8333-333333333301', org: ORGS.hannahRail.id, name: 'Marsh Lane Bridge Renewal' },
  a61: { id: '33333333-3333-4333-8333-333333333302', org: ORGS.westmoor.id, name: 'A61 Drainage Improvements' },
} as const

export const DOCUMENTS = {
  gaDeckPlan: { id: '44444444-4444-4444-8444-444444444401', project: PROJECTS.marshLane.id, name: 'GA Drawing — Deck Plan.pdf' },
  drainageLayout: { id: '44444444-4444-4444-8444-444444444404', project: PROJECTS.a61.id, name: 'Drainage Layout.pdf' },
} as const

export const APPS = {
  itpEngine: 'itp-engine',
  bidStudio: 'bid-studio',
  demo: 'plinth-demo',
} as const

export const baseURL = process.env.PLINTH_E2E_BASE_URL ?? 'http://localhost:3000'
