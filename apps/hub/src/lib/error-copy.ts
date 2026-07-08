/**
 * PLINTH_* error code → designed UK-English copy (SPEC §9: "The UI maps each
 * to designed copy"). Suite apps receive the same codes from the licence
 * endpoint and may reuse this table.
 */
export const ERROR_COPY: Record<string, { title: string; body: string }> = {
  PLINTH_AUTH_REQUIRED: {
    title: 'Please sign in',
    body: 'Your session has ended or you have not signed in yet.',
  },
  PLINTH_MFA_REQUIRED: {
    title: 'Extra verification needed',
    body: 'Your organisation requires two-factor authentication before you can continue.',
  },
  PLINTH_FORBIDDEN: {
    title: 'You don’t have access to that',
    body: 'If you think you should, ask your organisation admin.',
  },
  PLINTH_NO_SUBSCRIPTION: {
    title: 'No subscription for this app',
    body: 'Your organisation hasn’t subscribed yet. An owner or admin can start one under Billing.',
  },
  PLINTH_SEATS_EXHAUSTED: {
    title: 'All seats are taken',
    body: 'Every purchased seat is assigned. Add seats under Billing, or unassign someone under People.',
  },
  PLINTH_QUOTA_EXCEEDED: {
    title: 'Storage is full',
    body: 'This upload would take you over your storage quota. Empty the recycle bin or upgrade your plan.',
  },
  PLINTH_FILE_TYPE_BLOCKED: {
    title: 'That file type isn’t accepted',
    body: 'For safety we only accept common document, image, CAD and archive formats.',
  },
  PLINTH_FILE_TOO_LARGE: {
    title: 'File too large',
    body: 'Files can be up to 500 MB each.',
  },
  PLINTH_TOKEN_EXPIRED: {
    title: 'Launch link expired',
    body: 'Launch links only live for ten minutes. Go back to the Hub and launch again.',
  },
  PLINTH_TOKEN_REPLAY: {
    title: 'Launch link already used',
    body: 'For security each launch link works once. Launch again from the Hub.',
  },
  PLINTH_APP_NOT_AVAILABLE: {
    title: 'App not available',
    body: 'That app doesn’t exist or isn’t live yet.',
  },
  PLINTH_AI_DISABLED: {
    title: 'Ask Plinth is off',
    body: 'An owner or admin has switched Ask Plinth off for your organisation.',
  },
  PLINTH_AI_LIMIT: {
    title: 'Daily AI limit reached',
    body: 'Your organisation has used its Ask Plinth allowance for today. It resets at midnight.',
  },
  PLINTH_RATE_LIMITED: {
    title: 'Slow down a moment',
    body: 'Too many requests in a short time. Wait a few seconds and try again.',
  },
  PLINTH_VALIDATION: {
    title: 'That didn’t look right',
    body: 'Something about the request wasn’t valid. Check the details and try again.',
  },
}

/** Humanised audit action strings (SPEC §5 audit viewer). */
export const ACTION_COPY: Record<string, string> = {
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'organisation.created': 'created the organisation',
  'member.invited': 'invited a member',
  'member.joined': 'joined the organisation',
  'member.role_changed': 'changed a member’s role',
  'member.removed': 'removed a member',
  'invitation.revoked': 'revoked an invitation',
  'sso.launch': 'launched an app',
  'seat.assigned': 'assigned a seat',
  'seat.unassigned': 'unassigned a seat',
  'seat.requested': 'requested a seat',
  'app.notify_me': 'asked to be notified about an app',
  'billing.checkout_started': 'started checkout',
  'billing.subscription_started': 'subscription started',
  'billing.subscription_updated': 'subscription updated',
  'billing.subscription_cancelled': 'subscription cancelled',
  'billing.trial_started': 'started a trial',
  'billing.trial_ended': 'trial ended',
  'billing.payment_failed': 'payment failed',
  'billing.restored': 'billing restored',
  'project.created': 'created a project',
  'project.member_added': 'added someone to a project',
  'project.member_removed': 'removed someone from a project',
  'folder.created': 'created a folder',
  'document.uploaded': 'uploaded a document version',
  'document.downloaded': 'downloaded a document',
  'document.deleted': 'moved a document to the bin',
  'document.restored': 'restored a document',
  'document.purged': 'purged a deleted document',
  'impersonation.started': 'Plinth support session started',
  'impersonation.ended': 'Plinth support session ended',
  'catalogue.app_created': 'created a catalogue app',
  'catalogue.app_updated': 'updated a catalogue app',
  'flag.updated': 'changed a feature flag',
  'flag.org_override': 'changed an organisation flag',
  'ai.create_project': 'Ask Plinth created a project',
  'ai.invite_member': 'Ask Plinth sent an invitation',
  'ai.start_trial': 'Ask Plinth started a trial',
  'ai.assign_licence': 'Ask Plinth assigned a seat',
  'ai.create_folder': 'Ask Plinth created a folder',
}
