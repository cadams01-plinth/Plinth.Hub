import 'server-only'

/**
 * Transactional email — SPEC §8, via Resend's REST API (no SDK needed).
 * Every template: navy header band with the lockup, titleblock metadata
 * strip, plain-language body, one primary CTA, plain-text alternative.
 * UK English throughout. From hub@, reply-to Chris@.
 */

const FROM = 'Plinth Hub <hub@plinthresource.com>'
const REPLY_TO = 'Chris@plinthresource.com'

export type TemplateName =
  | 'invite'
  | 'welcome'
  | 'trial_started'
  | 'trial_ending_3d'
  | 'trial_ended'
  | 'payment_failed'
  | 'subscription_restored'
  | 'new_signin_unrecognised'
  | 'seat_assigned'
  | 'seats_over_capacity'
  | 'impersonation_notice'
  | 'seat_requested'

interface TemplateInput {
  orgName?: string
  appName?: string
  actorName?: string
  cta?: { label: string; url: string }
  detail?: string
}

const HUB = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.plinthresource.com'

const COPY: Record<TemplateName, (i: TemplateInput) => { subject: string; heading: string; body: string; cta: { label: string; url: string } }> = {
  invite: (i) => ({
    subject: `You've been invited to ${i.orgName} on Plinth`,
    heading: `Join ${i.orgName}`,
    body: `${i.actorName ?? 'A colleague'} has invited you to ${i.orgName}'s workspace on Plinth Hub. Accept the invitation to get access to their projects, documents and apps.`,
    cta: i.cta ?? { label: 'Accept invitation', url: `${HUB}/sign-in` },
  }),
  welcome: (i) => ({
    subject: 'Welcome to Plinth Hub',
    heading: 'Welcome to Plinth',
    body: `Your account is ready. Create your first project, upload documents, and explore the suite — everything lives behind one sign-in.`,
    cta: i.cta ?? { label: 'Open the Hub', url: `${HUB}/launcher` },
  }),
  trial_started: (i) => ({
    subject: `Your ${i.appName} trial has started`,
    heading: `14 days of ${i.appName}`,
    body: `Your trial of ${i.appName} for ${i.orgName} is live. You have full access for 14 days — no card required. We'll nudge you three days before it ends.`,
    cta: i.cta ?? { label: `Open ${i.appName}`, url: `${HUB}/launcher` },
  }),
  trial_ending_3d: (i) => ({
    subject: `Your ${i.appName} trial ends in 3 days`,
    heading: 'Three days left',
    body: `${i.orgName}'s trial of ${i.appName} ends in three days. Subscribe now to keep your team's access — everything you've set up carries straight over.`,
    cta: i.cta ?? { label: 'Choose a plan', url: `${HUB}/billing` },
  }),
  trial_ended: (i) => ({
    subject: `Your ${i.appName} trial has ended`,
    heading: 'Trial ended',
    body: `${i.orgName}'s trial of ${i.appName} has ended. Your data is safe and untouched — subscribe whenever you're ready to pick up where you left off.`,
    cta: i.cta ?? { label: 'Subscribe', url: `${HUB}/billing` },
  }),
  payment_failed: (i) => ({
    subject: 'Payment failed — action needed',
    heading: 'We could not take payment',
    body: `The latest payment for ${i.orgName} failed. Please update your payment details within 14 days to keep your subscriptions active. ${i.detail ?? ''}`,
    cta: i.cta ?? { label: 'Update payment details', url: `${HUB}/billing` },
  }),
  subscription_restored: (i) => ({
    subject: 'Payment received — all restored',
    heading: 'You are back up and running',
    body: `Payment for ${i.orgName} has come through and every subscription is active again. Thanks for sorting it.`,
    cta: i.cta ?? { label: 'Open the Hub', url: `${HUB}/launcher` },
  }),
  new_signin_unrecognised: (i) => ({
    subject: 'New sign-in to your Plinth account',
    heading: 'Was this you?',
    body: `We noticed a sign-in to your account from a device or location we did not recognise. ${i.detail ?? ''} If this was you, there's nothing to do. If not, reset your password now.`,
    cta: i.cta ?? { label: 'Review account security', url: `${HUB}/sign-in` },
  }),
  seat_assigned: (i) => ({
    subject: `You now have access to ${i.appName}`,
    heading: `${i.appName} is ready for you`,
    body: `${i.actorName ?? 'Your admin'} has assigned you a seat on ${i.appName} in ${i.orgName}. Launch it from the Hub whenever you're ready.`,
    cta: i.cta ?? { label: `Launch ${i.appName}`, url: `${HUB}/launcher` },
  }),
  seats_over_capacity: (i) => ({
    subject: `${i.appName}: more people assigned than seats`,
    heading: 'Seats over capacity',
    body: `${i.orgName} now has more people assigned to ${i.appName} than the subscription covers. Nobody has been removed — but please either add seats or unassign someone. ${i.detail ?? ''}`,
    cta: i.cta ?? { label: 'Review seats', url: `${HUB}/people` },
  }),
  impersonation_notice: (i) => ({
    subject: 'Plinth support accessed your organisation',
    heading: 'Support session ended',
    body: `A member of Plinth staff accessed ${i.orgName} in a support session, with consent reference ${i.detail ?? '(recorded)'}. The full action log is in your audit view — transparency is the point.`,
    cta: i.cta ?? { label: 'View the audit log', url: `${HUB}/audit` },
  }),
  seat_requested: (i) => ({
    subject: `${i.actorName ?? 'A team member'} needs a seat on ${i.appName}`,
    heading: 'Seat request',
    body: `${i.actorName ?? 'A team member'} has asked for access to ${i.appName} in ${i.orgName}. Assign a seat from the People page — it takes a few seconds.`,
    cta: i.cta ?? { label: 'Assign a seat', url: `${HUB}/people` },
  }),
}

function renderHtml(t: { heading: string; body: string; cta: { label: string; url: string } }, orgName?: string) {
  return `<!doctype html>
<html lang="en-GB"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b2534;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="background:#0d1f3d;border-radius:12px 12px 0 0;padding:20px 28px;border-bottom:3px solid #e0a526;">
        <span style="color:#e0a526;font-weight:800;letter-spacing:5px;font-size:16px;">PLINTH</span>
        <span style="color:#b9c0cc;font-size:14px;letter-spacing:2px;">&nbsp;| RESOURCE</span>
      </td></tr>
      <tr><td style="background:#081527;color:#b9c0cc;font-size:11px;letter-spacing:1px;padding:6px 28px;text-transform:uppercase;">
        Plinth Hub${orgName ? ` · ${orgName}` : ''} · ${new Date().toLocaleDateString('en-GB')}
      </td></tr>
      <tr><td style="background:#ffffff;padding:28px;border:1px solid #dde2e9;border-top:0;">
        <h1 style="font-size:20px;margin:0 0 12px;">${t.heading}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">${t.body}</p>
        <a href="${t.cta.url}" style="display:inline-block;background:#e0a526;color:#081527;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;">${t.cta.label}</a>
      </td></tr>
      <tr><td style="background:#081527;color:#5a6779;border-radius:0 0 12px 12px;padding:14px 28px;font-size:12px;">
        Plinth Resource Ltd · hub.plinthresource.com
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

/**
 * Send a templated email. No-ops (with a log line) when RESEND_API_KEY is
 * absent so dev environments never block on email. Never throws — email
 * failure must not fail the triggering operation.
 */
export async function sendEmail(
  template: TemplateName,
  to: string | string[],
  input: TemplateInput = {},
): Promise<void> {
  const t = COPY[template](input)
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[email skipped — no RESEND_API_KEY] ${template} → ${to}: ${t.subject}`)
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: Array.isArray(to) ? to : [to],
        subject: t.subject,
        html: renderHtml(t, input.orgName),
        text: `${t.heading}\n\n${t.body}\n\n${t.cta.label}: ${t.cta.url}`,
      }),
    })
    if (!res.ok) console.error('resend error', res.status, await res.text())
  } catch (err) {
    console.error('resend send failed', template, err)
  }
}
