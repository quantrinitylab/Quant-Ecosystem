'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Quanty } from './Quanty';
import { useDeferredMount } from '../hooks/useDeferredMount';

/**
 * The way into Quanty, as one primitive instead of a pattern each route
 * re-types.
 *
 * Two routes had this: the inbox and the calendar, each with its own copy of the
 * same five parts — a `useState`, a `useDeferredMount`, a `dynamic()` import, a
 * trigger button, and the drawer. Twenty-one other surfaces that mount
 * `AppShell` had none, so on Drive, Contacts, Settings, Search, every mailbox
 * and all of QuantGit the assistant simply did not exist. The two copies had
 * already drifted: `size={22}` with `rounded-xl` and a `title` on one,
 * `size={24}` with `rounded-lg` and no `title` on the other, and only the inbox
 * ever told Quanty what page it was on.
 *
 * The split into two exports is deliberate and structural. The trigger belongs
 * in the header; the drawer must not, because `AppShell` swaps its whole header
 * out for `customHeader` — which the inbox does the moment a message is
 * selected. A drawer mounted inside the header would be unmounted by that swap
 * and take the conversation with it. So the drawer hangs at the shell's top
 * level next to `QuantFab`, and only the trigger disappears with the header.
 */

/**
 * Where the user is, in a phrase Quanty can read. Ordered longest-prefix-first,
 * because `/repos/:id/editor` is a different answer from `/repos`.
 *
 * These are the routes that mount `AppShell`. `/thread` and `/compose` are
 * absent on purpose: they carry their own Quanty with the open message or the
 * draft in hand, which is strictly more context than a route name, and
 * `AppShell` does not render a second trigger there.
 */
const VIEW_LABELS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ['/repos/', 'Looking at a QuantGit repository'],
  ['/repos', 'Browsing QuantGit repositories'],
  ['/codehub', 'Browsing code in QuantGit'],
  ['/pipelines', 'Looking at QuantGit pipelines'],
  ['/workspaces', 'Managing workspaces'],
  ['/calendar', 'Looking at the calendar'],
  ['/contacts', 'Browsing contacts'],
  ['/drive', 'Browsing files in Drive'],
  ['/postcard', 'Designing a postcard'],
  ['/settings', 'Changing QuantMail settings'],
  ['/security', 'Reviewing account security'],
  ['/search', 'Searching mail'],
  ['/labels', 'Managing mail labels'],
  ['/starred', 'Reading starred mail'],
  ['/snoozed', 'Reading snoozed mail'],
  ['/archive', 'Reading archived mail'],
  ['/drafts', 'Reading draft messages'],
  ['/trash', 'Reading deleted mail'],
  ['/spam', 'Reading spam'],
  ['/sent', 'Reading sent mail'],
];

function viewLabelForRoute(pathname: string): string {
  if (pathname === '/') return 'Browsing the primary inbox';
  const match = VIEW_LABELS.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'Using QuantMail';
}

/**
 * Loaded on demand: the drawer is 660+ lines plus its own chat history layer,
 * and it now sits on every shell route, so putting it in the first chunk would
 * make the whole app pay for a panel most sessions never open. Paired with
 * `useDeferredMount`, the code is fetched the first time Quanty is actually
 * asked for and then stays mounted, so the conversation survives closing the
 * drawer exactly as it would with a static import.
 */
const QuantyCopilotDrawer = dynamic(() => import('./QuantyCopilotDrawer'), { ssr: false });

export function QuantyTrigger({ onOpen, isOpen }: { onOpen: () => void; isOpen: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      /*
       * 44px on a phone, 36px once there is a pointer — the same step every
       * other control in this header takes. `size-11` is the floor rather than
       * padding around a 22px mark, so the tap target is the button, not the
       * artwork.
       */
      className="inline-flex size-11 sm:size-9 items-center justify-center rounded-xl text-[#FF8C42] transition-colors hover:bg-[#282C35] hover:text-[#FFB875] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
      title="Ask Quanty"
      aria-label="Ask Quanty"
      aria-expanded={isOpen}
    >
      {/*
       * `bob={false}`: this is a control in a header, not a mascot on a hero.
       * A permanently animating 22px figure in the top-right corner of every
       * route reads as a notification that never clears.
       */}
      <Quanty size={22} expression="happy" bob={false} />
    </button>
  );
}

export function QuantyDrawerHost({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? '/';
  const shouldMount = useDeferredMount(isOpen);

  if (!shouldMount) return null;

  return (
    <QuantyCopilotDrawer
      isOpen={isOpen}
      onClose={onClose}
      viewLabel={viewLabelForRoute(pathname)}
    />
  );
}
