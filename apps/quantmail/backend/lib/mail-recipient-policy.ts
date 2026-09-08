/**
 * Mailbox routing and visible recipient roles are different concerns.
 * Only the platform's existing mail domains may resolve to local usernames.
 * Bcc recipients remain part of the delivery envelope, never visible headers.
 */
export const INTERNAL_MAIL_DOMAINS = [
  'quantmail.in',
  'quantrinity.in',
  'quantchat.online',
] as const;

export function normalizeMailAddresses(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [
    ...new Set(
      values
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function isInternalMailAddress(address: string): boolean {
  const parts = address.trim().toLowerCase().split('@');
  return (
    parts.length === 2 &&
    /^[^\s<>@]+$/.test(parts[0] ?? '') &&
    INTERNAL_MAIL_DOMAINS.some((domain) => domain === parts[1])
  );
}

/** Returns only addresses in the already-supported local namespace. */
export function internalMailboxAliases(mailbox: {
  email: string;
  username: string | null;
}): string[] {
  const handles = new Set<string>();
  const username = mailbox.username?.trim().toLowerCase();
  if (username && /^[^\s<>@]+$/.test(username)) handles.add(username);
  if (isInternalMailAddress(mailbox.email)) {
    handles.add(mailbox.email.trim().toLowerCase().split('@')[0]!);
  }
  return [...handles].flatMap((handle) =>
    INTERNAL_MAIL_DOMAINS.map((domain) => `${handle}@${domain}`),
  );
}

/** The lookup contains no external address or external address's local part. */
export function internalRecipientLookup(addresses: readonly string[]) {
  const local = normalizeMailAddresses(addresses).filter(isInternalMailAddress);
  const handles = [...new Set(local.map((address) => address.split('@')[0]!))];
  return {
    local,
    where: {
      OR: [
        { email: { in: local, mode: 'insensitive' as const } },
        { username: { in: handles, mode: 'insensitive' as const } },
        {
          email: {
            in: handles.flatMap((handle) =>
              INTERNAL_MAIL_DOMAINS.map((domain) => `${handle}@${domain}`),
            ),
            mode: 'insensitive' as const,
          },
        },
      ],
    },
  };
}

export interface MailRecipientFields {
  toAddresses?: unknown;
  ccAddresses?: unknown;
  bccAddresses?: unknown;
}

export function mailRecipientRoles(input: MailRecipientFields) {
  const to = normalizeMailAddresses(input.toAddresses);
  const visible = new Set(to);
  const cc = normalizeMailAddresses(input.ccAddresses).filter((address) => !visible.has(address));
  cc.forEach((address) => visible.add(address));
  const bcc = normalizeMailAddresses(input.bccAddresses).filter((address) => !visible.has(address));
  return { to, cc, bcc, envelope: [...to, ...cc, ...bcc] };
}

/** Use this only for message headers, not SMTP/SES envelope destinations. */
export function visibleRecipientHeaders(input: MailRecipientFields): Record<string, string> {
  const { to, cc } = mailRecipientRoles(input);
  return {
    to: to.length > 0 ? to.join(', ') : 'undisclosed-recipients:;',
    ...(cc.length > 0 ? { cc: cc.join(', ') } : {}),
  };
}
