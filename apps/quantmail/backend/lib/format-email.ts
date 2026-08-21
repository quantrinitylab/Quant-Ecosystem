// ============================================================================
// QuantMail - Email Response Formatter
// Ensures both flat Prisma fields (fromAddress, fromName, toAddresses) and
// structured frontend types (from: {email, name}, to: [{email, name}]) are
// populated consistently on every email payload.
// ============================================================================

export function formatEmailRecord<T extends Record<string, any>>(email: T): T {
  if (!email) return email;

  const fromAddress: string =
    email.fromAddress || (typeof email.from === 'string' ? email.from : email.from?.email) || '';
  const fromName: string =
    email.fromName ||
    email.from?.name ||
    (fromAddress ? fromAddress.split('@')[0] : 'QuantMail User');

  const toAddresses: string[] = Array.isArray(email.toAddresses)
    ? email.toAddresses
    : Array.isArray(email.to)
      ? email.to.map((t: any) => (typeof t === 'string' ? t : t?.email)).filter(Boolean)
      : typeof email.to === 'string' && email.to
        ? [email.to]
        : [];

  const ccAddresses: string[] = Array.isArray(email.ccAddresses)
    ? email.ccAddresses
    : Array.isArray(email.cc)
      ? email.cc.map((t: any) => (typeof t === 'string' ? t : t?.email)).filter(Boolean)
      : [];

  const bccAddresses: string[] = Array.isArray(email.bccAddresses)
    ? email.bccAddresses
    : Array.isArray(email.bcc)
      ? email.bcc.map((t: any) => (typeof t === 'string' ? t : t?.email)).filter(Boolean)
      : [];

  const bodyPlain: string = email.bodyPlain ?? email.bodyText ?? '';
  const bodyHtml: string = email.bodyHtml ?? '';

  return {
    ...email,
    fromAddress,
    fromName,
    from: {
      email: fromAddress,
      name: fromName,
    },
    toAddresses,
    to: toAddresses.map((addr) => ({
      email: addr,
      name: addr.split('@')[0] || addr,
    })),
    ccAddresses,
    cc: ccAddresses.map((addr) => ({
      email: addr,
      name: addr.split('@')[0] || addr,
    })),
    bccAddresses,
    bcc: bccAddresses.map((addr) => ({
      email: addr,
      name: addr.split('@')[0] || addr,
    })),
    bodyPlain,
    bodyText: bodyPlain,
    bodyHtml,
    category: email.aiCategory || email.category || 'primary',
  };
}
