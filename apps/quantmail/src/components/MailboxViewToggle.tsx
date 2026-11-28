import Link from 'next/link';

/**
 * Mailbox view switcher (People | Inbox).
 *
 * 2026-10-11 P1 fix ("Start a new chat" obscured by the pills): this nav used
 * to be a `fixed right-3 top-3 z-[60]` overlay. Being positioned, it painted
 * on top of the inbox hero's "New chat" primary action and intercepted its
 * clicks/taps (an automated click was refused at hit test; on a touch device
 * it is a real tap-miss). It also forced SelectionHeader into a z-index arms
 * race (bumped to z-[70]) just to stay tappable.
 *
 * It is now in normal document flow, right-aligned at the top of each view —
 * visually in the same top-right spot, but an in-flow element can never cover
 * anything: siblings lay out after it instead of underneath it. No z-index,
 * no `fixed`, no `absolute`, no `sticky` — the test below pins that.
 */
/**
 * Spam-lens note (2026-10-25 fix/qm-spam-lens-toggle): the People home
 * honors exactly one lens — `?lens=spam` (see PeopleHome's isSpamLens) —
 * so `lens` is deliberately spam-only, not a generic passthrough. Carrying
 * any other classic-inbox lens to the People view would be a no-op there
 * (PeopleHome would ignore it) and would mislead the user into thinking
 * the lens survived the switch. When the spam lens is active both pills
 * carry it, in both directions: People home -> classic inbox AND classic
 * inbox -> People home. Without it, tapping either pill silently landed
 * on the plain inbox people, abandoning the spam review the user was in.
 */
export function MailboxViewToggle({ isInbox, lens }: { isInbox: boolean; lens?: string | null }) {
  const isSpamLens = lens === 'spam';
  const peopleHref = isSpamLens ? '/?lens=spam' : '/';
  const inboxHref = isSpamLens ? '/?view=inbox&lens=spam' : '/?view=inbox';
  const linkClass = (active: boolean) =>
    `min-h-[44px] px-4 inline-flex items-center rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] ${
      active
        ? 'bg-[#FF7A00] text-black shadow-sm font-bold'
        : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.05]'
    }`;

  return (
    <nav
      aria-label="Mailbox view"
      className="flex items-center gap-1 rounded-xl bg-[#16181F] p-1 border border-[#232938]"
    >
      <Link
        href={inboxHref}
        className={linkClass(isInbox)}
        aria-current={isInbox ? 'page' : undefined}
      >
        Inbox
      </Link>
      <Link
        href={peopleHref}
        className={linkClass(!isInbox)}
        aria-current={!isInbox ? 'page' : undefined}
      >
        People
      </Link>
    </nav>
  );
}
