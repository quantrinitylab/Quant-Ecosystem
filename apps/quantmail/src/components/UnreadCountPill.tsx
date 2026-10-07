'use client';

/**
 * UnreadCountPill — WhatsApp-style green unread-count badge for thread rows.
 *
 * The number is always the thread's real unread count
 * (`ConversationThread.unreadCount`: messages neither read nor sent by the
 * signed-in user). It renders nothing when the count is zero — no invented
 * badges, no placeholders. Caps at `99+` like WhatsApp so a 400-message
 * thread does not stretch the row's meta line.
 */
export function UnreadCountPill({ count }: { count: number }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span
      aria-label={`${count} unread message${count === 1 ? '' : 's'}`}
      className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[10px] font-bold leading-none text-[#0B141A]"
    >
      {label}
    </span>
  );
}

export default UnreadCountPill;
