// Flash messages are passed as short codes in the query string and mapped
// here, so user-controlled text is never reflected into the page.
const MESSAGES: Record<string, { text: string; kind: 'ok' | 'error' | 'info' }> = {
  sent: { kind: 'ok', text: 'If that email belongs to a member, a sign-in link is on its way. It expires in 15 minutes.' },
  link_invalid: { kind: 'error', text: 'That sign-in link is invalid or has expired. Please request a new one.' },
  login_failed: { kind: 'error', text: 'Sign-in failed. Please try again or use an email link.' },
  rate_limited: { kind: 'error', text: 'Too many attempts. Please wait a while and try again.' },
  invalid: { kind: 'error', text: 'Please check the form and try again.' },
  saved: { kind: 'ok', text: 'Saved.' },
  welcome: { kind: 'ok', text: 'Welcome! Add a passkey so you can sign in quickly and securely next time.' },
  passkey_added: { kind: 'ok', text: 'Passkey added.' },
  passkey_removed: { kind: 'ok', text: 'Passkey removed.' },
  last_passkey: { kind: 'error', text: 'Admins must keep at least one passkey.' },
  session_revoked: { kind: 'ok', text: 'Session signed out.' },
  sessions_revoked: { kind: 'ok', text: 'All other sessions were signed out.' },
  admin_passkey: { kind: 'info', text: 'Admin tools require signing in with a passkey. Add one below, then sign out and back in with it.' },
  photo_rejected: { kind: 'error', text: 'Please upload a JPEG, PNG or WebP image under 5 MB.' },
  photo_removed: { kind: 'ok', text: 'Photo removed.' },
  message_sent: { kind: 'ok', text: 'Message sent. They’ll get an email letting them know (your email address is not shared).' },
  message_limit: { kind: 'error', text: 'You’ve reached today’s message limit. New accounts can send 2 introductions a day for their first week.' },
  message_unavailable: { kind: 'error', text: 'This message could not be sent.' },
  rec_saved: { kind: 'ok', text: 'Thanks! Your recommendation was posted.' },
  rec_exists: { kind: 'error', text: 'You’ve already recommended this member.' },
  rec_removed: { kind: 'ok', text: 'Recommendation removed.' },
  rec_updated: { kind: 'ok', text: 'Recommendation visibility updated.' },
  reported: { kind: 'ok', text: 'Thank you. An administrator will review your report.' },
  blocked: { kind: 'ok', text: 'Member blocked. They can no longer message you, and you won’t see each other’s messages.' },
  unblocked: { kind: 'ok', text: 'Member unblocked.' },
  invite_created: { kind: 'ok', text: 'Invite created and emailed.' },
  invite_exists: { kind: 'error', text: 'That email already has an account.' },
  invite_revoked: { kind: 'ok', text: 'Invite revoked.' },
  done: { kind: 'ok', text: 'Done.' },
  last_admin: { kind: 'error', text: 'There must always be at least one active admin.' },
  confirm_delete: { kind: 'error', text: 'Type DELETE to confirm.' },
};

export function Notice({ code }: { code?: string | string[] }) {
  const c = typeof code === 'string' ? MESSAGES[code] : undefined;
  if (!c) return null;
  return (
    <div className={`notice notice-${c.kind}`} role={c.kind === 'error' ? 'alert' : 'status'}>
      {c.text}
    </div>
  );
}
