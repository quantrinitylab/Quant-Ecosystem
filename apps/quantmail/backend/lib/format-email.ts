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

  /*
   * The stored kind is the Prisma enum (`MAIL` / `CHAT`); the client contract is
   * lowercase, matching how `priority` and `category` already read on the wire.
   * A row written before migration 0052 comes back without the column at all, and
   * everything sent before the chat composer existed was a letter, so the fallback
   * is `mail`.
   */
  const messageKind: 'mail' | 'chat' =
    String(email.messageKind ?? '').toUpperCase() === 'CHAT' ? 'chat' : 'mail';

  const rawAttachments = Array.isArray(email.attachments) ? email.attachments : [];
  const attachments = rawAttachments.map((att: any, idx: number) => {
    if (typeof att === 'string') {
      return {
        id: `att_${idx}`,
        filename: att.split('/').pop() || `attachment_${idx + 1}`,
        mimeType: 'application/octet-stream',
        size: 0,
        url: att,
      };
    }
    return {
      id: att.id || `att_${idx}_${Date.now()}`,
      filename: att.filename || att.name || `attachment_${idx + 1}`,
      mimeType: att.mimeType || att.contentType || att.type || 'application/octet-stream',
      size: typeof att.size === 'number' ? att.size : 0,
      url: att.url || att.dataUrl || '',
      contentId: att.contentId,
      isInline: Boolean(att.isInline),
    };
  });

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
    hasAttachments: attachments.length > 0,
    attachments,
    messageKind,
    category: email.aiCategory || email.category || 'primary',
  };
}
