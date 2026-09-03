import Link from 'next/link';

/**
 * 404.
 *
 * The app had no `not-found.tsx`, so any unmatched URL rendered Next's built-in
 * page — white background, Helvetica, no way back into the product. Two links in
 * the shipped UI already point at routes that do not exist (`/notifications`,
 * `/invitations`), so this was reachable in normal use, not just by typing.
 *
 * A server component by design: a 404 should not cost a JS chunk, and nothing
 * here needs state.
 */

const DESTINATIONS = [
  { href: '/', label: 'Inbox', hint: 'Your conversations' },
  { href: '/calendar', label: 'Calendar', hint: 'Schedule and events' },
  { href: '/drive', label: 'Drive', hint: 'Files and attachments' },
  { href: '/contacts', label: 'Contacts', hint: 'People you write to' },
  { href: '/search', label: 'Search', hint: 'Find anything' },
  { href: '/settings', label: 'Settings', hint: 'Account and preferences' },
];

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[100dvh] items-center justify-center bg-[#090A0C] p-6"
    >
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <svg
            viewBox="0 0 24 24"
            className="mx-auto mb-4 size-11 text-[#FF8C42]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7.2" />
            <path d="M16.3 16.3 21 21M8.4 11h5.2" />
          </svg>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF8C42]">
            Error 404
          </p>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#F5F5F5]">
            This page doesn&apos;t exist
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#A1A4AC]">
            The link may be out of date, or the view may have moved. Here is where everything
            actually lives.
          </p>
        </div>

        <nav aria-label="Go to" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DESTINATIONS.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              className="group flex min-h-touch items-center justify-between gap-3 rounded-xl bg-[#111318] px-4 py-3 shadow-[inset_0_0_0_1px_#282C35] transition-colors hover:bg-[#16181D] hover:shadow-[inset_0_0_0_1px_#5C3016] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] motion-reduce:transition-none"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#F5F5F5]">
                  {destination.label}
                </span>
                <span className="block truncate text-[11px] text-[#6B6E76]">
                  {destination.hint}
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className="size-4 flex-none text-[#6B6E76] transition-colors group-hover:text-[#FF8C42] motion-reduce:transition-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
