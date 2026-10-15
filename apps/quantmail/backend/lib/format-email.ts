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
  /*
   * Synthesized ids use the `meta_` prefix — NEVER `att_`. The `att_`
   * namespace belongs to AttachmentService (`att_<uuid>`, minted in
   * backend/services/attachment.service.ts), whose ids mean "the backend can
   * read these bytes" (QM-M39-010 Save-to-Drive, /api/attachments/:id/download).
   * Synthesizing `att_` ids for metadata-only rows made prefix-based gates
   * offer Save-to-Drive on bytes that don't exist (readAttachment 404). Even
   * though the client now matches the strict UUID shape, the prefix must not
   * collide, for any consumer of the wire.
   */
  const attachments = rawAttachments.map((att: any, idx: number) => {
    if (typeof att === 'string') {
      return {
        id: `meta_${idx}`,
        filename: att.split('/').pop() || `attachment_${idx + 1}`,
        mimeType: 'application/octet-stream',
        size: 0,
        url: att,
      };
    }
    return {
      id: att.id || `meta_${idx}_${Date.now()}`,
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
    /*
     * Folder-state bridging: the database tracks archive/trash via `folderId`
     * and `isTrash`, but the client's `belongsInFolder` predicate reads
     * `isArchived` / `trashedAt`. Without this mapping those fields were always
     * undefined on server data, so optimistic reconciliations and the offline
     * cache seed mis-filed messages (e.g. a later mutation could empty the
     * cached trash list because nothing in it "belonged" there).
     *
     * Explicitly-set values win (optimistic patches set them directly); the
     * folder relation is only consulted when present — most list queries don't
     * include it, in which case behaviour is unchanged from before.
     */
    isArchived:
      typeof email.isArchived === 'boolean'
        ? email.isArchived
        : (email as { folder?: { type?: string } | null }).folder?.type === 'ARCHIVE',
    /*
     * Snooze-state bridging: the database tracks snooze on `EmailThread`
     * (there is no `snoozedUntil` column on Email), but the client's
     * `belongsInFolder` predicate reads `email.snoozedUntil`. Without this
     * mapping the SNOOZED list filtered server-side on the thread relation
     * but shipped rows with `snoozedUntil` undefined, so the offline seed
     * dropped every row and a cold load of the snoozed view showed an empty
     * state for mail that exists.
     *
     * Explicitly-set values win (the snooze/unsnooze optimistic patches set
     * them directly on the client object); the thread relation is only
     * consulted when present — queries that don't include it behave exactly
     * as before.
     */
    snoozedUntil:
      email.snoozedUntil ??
      (email as { thread?: { snoozedUntil?: unknown } | null }).thread?.snoozedUntil ??
      undefined,
    /*
     * Scheduled-send bridging: the client `Email` type carries `scheduledAt`,
     * but the database records a future send as `sentAt` (the scheduled fire
     * time, stamped by the send service) plus `deliveryStatus = 'queued'`
     * (the BullMQ delay holds the job back). Without this mapping a queued
     * row arrives with `scheduledAt` undefined and the Scheduled mailbox
     * would have to special-case the wire shape — and the client's
     * `belongsInFolder(row, 'SCHEDULED')` offline predicate would drop
     * every row on a cold load (the SNOOZED bug class above). Only queued
     * rows get the bridge: once the job fires, `sentAt` is a historical
     * send time, not a schedule.
     *
     * Explicitly-set values win (an optimistic patch sets it directly);
     * `undefined` keys do not survive JSON, so non-scheduled rows read
     * exactly as before.
     */
    scheduledAt:
      email.scheduledAt ??
      (email.deliveryStatus === 'queued' && email.sentAt ? email.sentAt : undefined),
    trashedAt:
      email.trashedAt ?? (email.isTrash ? (email.deletedAt ?? email.updatedAt ?? null) : undefined),
  };
}
