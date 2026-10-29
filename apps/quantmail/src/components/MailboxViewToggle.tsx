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
 *
 * Compact form: on a phone the toggle sits in the top bar's search row next to
 * the search field, so it has to be narrow. Each pill is an icon; only the
 * ACTIVE pill spells out its label, and the inactive label stays in the markup
 * as screen-reader text so both links always have an accessible name.
 */
function InboxIcon() {
  return (
    <svg
      className="size-[15px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg
      className="size-[15px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function MailboxViewToggle({ isInbox }: { isInbox: boolean }) {
  const linkClass = (active: boolean) =>
    `min-h-[44px] min-w-[44px] justify-center gap-1.5 inline-flex items-center rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] ${
      active
        ? 'px-3 bg-[#FF7A00] text-black shadow-sm font-bold'
        : 'px-2.5 text-[#94A3B8] hover:text-white hover:bg-white/[0.05]'
    }`;

  return (
    <nav
      aria-label="Mailbox view"
      data-testid="mailbox-view-toggle"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-[#16181F] p-1 border border-[#232938]"
    >
      <Link
        href="/?view=inbox"
        className={linkClass(isInbox)}
        aria-current={isInbox ? 'page' : undefined}
        title="Inbox"
      >
        <InboxIcon />
        <span className={isInbox ? 'leading-none' : 'sr-only'}>Inbox</span>
      </Link>
      <Link
        href="/"
        className={linkClass(!isInbox)}
        aria-current={!isInbox ? 'page' : undefined}
        title="People"
      >
        <PeopleIcon />
        <span className={!isInbox ? 'leading-none' : 'sr-only'}>People</span>
      </Link>
    </nav>
  );
}
