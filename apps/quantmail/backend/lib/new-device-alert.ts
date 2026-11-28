/**
 * New-device sign-in security alerts.
 *
 * Gap (findings queue, 2026-10-12): Google emails a "New sign-in" security
 * alert (device/IP/time) for unfamiliar logins, but QuantMail issued browser
 * sessions silently — the login path had zero mailer calls and no new-device
 * detection, even though the channel exists (SES production access, out of
 * sandbox in us-east-1). This is wiring, not capability.
 *
 * What "new device" means here, honestly:
 * - A device is identified by its normalized User-Agent string — the only
 *   device signal the session record already carries (RefreshToken.userAgent,
 *   captured at issuance/rotation for the Security page's Active Sessions
 *   tab). It is client-controlled, so it is a heuristic, never proof of
 *   identity: two machines running the same browser build share a string,
 *   and a spoofed string can impersonate a known one. The alert is a
 *   tripwire, not an authentication factor.
 * - The known-device set is the user's LIVE browser families (not revoked,
 *   not expired, source 'browser' or untagged legacy). A revoked device that
 *   signs in again therefore alerts — that is exactly the case the user
 *   most wants to hear about. The trade-off: a device whose session expired
 *   (30-day TTL) alerts again on its next sign-in.
 * - A first-ever sign-in (no refresh-token families at all, live or
 *   otherwise) does NOT alert: registration just proved ownership of the
 *   address with a verification code, so an alert there would be noise, not
 *   signal. Note the distinction: "no LIVE families" is not "no history" —
 *   a user whose only families are revoked/expired still alerts, because
 *   the account HAS signed in before and this device is not among its live
 *   ones. The detector therefore reads the full session history and applies
 *   the liveness filter itself, instead of letting the query hide the
 *   no-history vs all-revoked distinction. OAuth grants count as history
 *   (the account has signed in before) but never as a known browser device:
 *   a third-party grant says nothing about which browser the user uses.
 * - A sign-in with no User-Agent at all alerts whenever prior families
 *   exist: an unidentifiable device cannot be proven known, so fail safe.
 *
 * Scope: browser sessions only (/auth/login and /auth/2fa/verify, the two
 * places issueBrowserSession is called for a password login). /auth/refresh
 * rotates inside an existing family, so it is not a new device. Third-party
 * OAuth grants are a separate surface and are not alerted here.
 *
 * Delivery is best-effort and never fails the login: SES is timeout-bounded
 * by sendViaSes, and every failure path returns false with a console error
 * instead of throwing. The caller must never gate the session on it.
 *
 * HARD RULE: email only. No phone/SMS anywhere — that channel was removed
 * by user order.
 */

/** Minimal shape of the session metadata the alert needs. */
export interface DeviceSignInMetadata {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * The only store access the detector needs — a structural subset of the
 * Prisma client, so callers pass `prisma as unknown as KnownDeviceStore`
 * and unit tests can substitute a fake without the generated client.
 */
export interface KnownDeviceStore {
  refreshToken: {
    findMany: (args: {
      where: unknown;
      select: { userAgent: true; isRevoked: true; expiresAt: true; source: true };
    }) => Promise<
      Array<{
        userAgent?: string | null;
        isRevoked: boolean;
        expiresAt: Date;
        source?: string | null;
      }>
    >;
  };
}

/**
 * Normalize a User-Agent into a device fingerprint: trim, collapse internal
 * whitespace runs, lowercase. Case/whitespace jitter in the same browser
 * build must not read as a new device. Returns null when there is nothing
 * usable to fingerprint.
 */
export const normalizeDeviceFingerprint = (
  userAgent: string | null | undefined,
): string | null => {
  if (typeof userAgent !== 'string') return null;
  const normalized = userAgent.replace(/\s+/g, ' ').trim().toLowerCase();
  return normalized ? normalized : null;
};

/**
 * True when this sign-in comes from a device the account has never signed
 * in from (among its live browser families). Must be called BEFORE the new
 * session is issued: issuance records this device, so a post-issuance check
 * would always self-match and never alert.
 */
export const isNewDeviceSignIn = async (
  store: KnownDeviceStore,
  userId: string,
  metadata: DeviceSignInMetadata,
  now: Date = new Date(),
): Promise<boolean> => {
  // Full session history, not just live rows: the no-history vs all-revoked
  // distinction above is only visible before the liveness filter.
  const history = await store.refreshToken.findMany({
    where: { userId },
    select: { userAgent: true, isRevoked: true, expiresAt: true, source: true },
  });
  // No families at all: the first sign-in ever. Registration already proved
  // address ownership, so there is nothing "new" to warn about.
  if (history.length === 0) return false;
  const current = normalizeDeviceFingerprint(metadata.userAgent);
  // No fingerprint to compare: cannot prove this device is known.
  if (current === null) return true;
  // Known = a LIVE BROWSER family with this fingerprint. Revoked/expired
  // families never count: a revoked device signing in again is the alert
  // case, and an expired session means the device has been absent for a
  // full TTL. OAuth grants never count either — they are not browser
  // devices — but they do count as history above, so an account that has
  // only ever used third-party grants still alerts on its first browser
  // sign-in from an unseen device.
  const live = history.filter(
    (row) =>
      !row.isRevoked &&
      row.expiresAt > now &&
      (row.source === 'browser' || row.source === null),
  );
  return !live.some((row) => normalizeDeviceFingerprint(row.userAgent) === current);
};

export const newDeviceAlertFrom = (): string =>
  process.env['NEW_DEVICE_ALERT_FROM'] ?? 'QuantMail <no-reply@quantmail.in>';

export const NEW_DEVICE_ALERT_SUBJECT = 'New sign-in to your QuantMail account';

export interface NewDeviceAlertDetails {
  name?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  signedInAt: Date;
}

const describeDevice = (details: NewDeviceAlertDetails): string =>
  details.userAgent?.trim() ? details.userAgent.trim() : 'an unrecognised device';

const describeIp = (details: NewDeviceAlertDetails): string =>
  details.ipAddress?.trim() ? details.ipAddress.trim() : 'unknown location';

export const newDeviceAlertText = (details: NewDeviceAlertDetails): string => {
  const name = details.name?.trim() || 'there';
  return [
    `Hi ${name},`,
    '',
    'Someone just signed in to your QuantMail account from a device we had not seen before:',
    '',
    `    Device: ${describeDevice(details)}`,
    `    IP address: ${describeIp(details)}`,
    `    Time: ${details.signedInAt.toISOString()}`,
    '',
    'If this was you, you can ignore this email.',
    'If this was not you, change your QuantMail password right away and review your Active Sessions under Security, where you can revoke any session you do not recognise.',
    '',
    '— The QuantMail team',
  ].join('\n');
};

const escapeHtml = (value: string): string =>
  value.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

export const newDeviceAlertHtml = (details: NewDeviceAlertDetails): string => {
  const name = escapeHtml(details.name?.trim() || 'there');
  return `<p>Hi ${name},</p>
<p>Someone just signed in to your QuantMail account from a device we had not seen before:</p>
<ul>
<li>Device: ${escapeHtml(describeDevice(details))}</li>
<li>IP address: ${escapeHtml(describeIp(details))}</li>
<li>Time: ${escapeHtml(details.signedInAt.toISOString())}</li>
</ul>
<p>If this was you, you can ignore this email.</p>
<p>If this was not you, change your QuantMail password right away and review your Active Sessions under Security, where you can revoke any session you do not recognise.</p>
<p>— The QuantMail team</p>`;
};

/**
 * Dispatch the alert. Returns true only when SES accepted the message.
 * Never throws: a failed alert must never fail — or delay beyond the SES
 * timeout — the sign-in it reports on.
 *
 * The ses-sender import is dynamic on purpose: it pulls in @quant/server-core,
 * whose worktree layout cannot resolve under vitest (see the email-verification
 * mock comment in auth-login-liveness.test.ts). Keeping the import lazy lets
 * unit tests import this module's pure detection/text helpers without dragging
 * that chain in; only an actual send pays for it.
 */
export const sendNewDeviceAlert = async (opts: {
  to: string;
  name?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  signedInAt: Date;
}): Promise<boolean> => {
  const { isSesConfigured, sendViaSes } = await import('./ses-sender');
  if (!isSesConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[new-device-alert] SES is not configured; no alert was sent to', opts.to);
    return false;
  }

  try {
    await sendViaSes({
      from: newDeviceAlertFrom(),
      to: [opts.to],
      subject: NEW_DEVICE_ALERT_SUBJECT,
      bodyText: newDeviceAlertText(opts),
      bodyHtml: newDeviceAlertHtml(opts),
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[new-device-alert] delivery failed', error);
    return false;
  }
};
