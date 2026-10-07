'use client';

// ============================================================================
// Shared UI - User Menu Component
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { nextRovingIndex, rovingTabIndex } from '../../utils/roving-focus';

export interface UserMenuUser {
  name: string;
  email: string;
  avatar?: string;
}

export interface UserMenuProps {
  user: UserMenuUser;
  onProfile?: () => void;
  onSettings?: () => void;
  onSignOut?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

interface MenuEntry {
  key: string;
  label: string;
  onSelect: () => void;
  icon: React.ReactNode;
  /** Sign out is destructive, so it reads red. */
  danger?: boolean;
  /** Draws a `role="separator"` above this entry, unless it is the first one. */
  separated?: boolean;
}

/*
  Three near-identical buttons became one map over this list — the same move that
  folded NotificationPanel's hand-written "All" chip into its filter map. It is what
  makes "every item gets the same `type`, the same tab stop and the same key
  handler" true by construction rather than by three blocks staying in step.

  The icons are decorative: each label sits right beside its glyph, so they are
  `aria-hidden`, as the rest of this folder already does with its icon spans.
*/
const ICON = 'w-4 h-4 flex-shrink-0';

const ProfileIcon = () => (
  <svg
    className={`${ICON} text-gray-400`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg
    className={`${ICON} text-gray-400`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const SignOutIcon = () => (
  <svg
    className={`${ICON} text-red-400`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
);

export const UserMenu: React.FC<UserMenuProps> = ({
  user,
  onProfile,
  onSettings,
  onSignOut,
  isOpen,
  onClose,
}) => {
  /*
    Every one of the three handlers is optional, and the menu rendered all three
    buttons regardless — so a consumer who passed only `onSignOut` shipped two
    items that did nothing when chosen. Building the list from the handlers that
    arrived removes that, and it is also what keeps the index arithmetic below
    honest: an item that is not there cannot be arrowed onto.
  */
  const items: MenuEntry[] = [];
  if (onProfile) {
    items.push({ key: 'profile', label: 'Profile', onSelect: onProfile, icon: <ProfileIcon /> });
  }
  if (onSettings) {
    items.push({
      key: 'settings',
      label: 'Settings',
      onSelect: onSettings,
      icon: <SettingsIcon />,
    });
  }
  if (onSignOut) {
    items.push({
      key: 'signout',
      label: 'Sign out',
      onSelect: onSignOut,
      icon: <SignOutIcon />,
      danger: true,
      separated: true,
    });
  }

  /*
    `aria-modal="true"` told a screen reader that nothing outside this menu exists,
    and the component kept none of that promise: nothing moved focus in on open,
    Tab walked straight back out into the page it had just hidden, and Escape did
    nothing — the only way out was a mouse click on the backdrop, which is
    `aria-hidden` and unreachable by keyboard by design. Fourth surface in this
    package to adopt the hook that already answers all three.
  */
  const trapRef = useFocusTrap<HTMLDivElement>({ active: isOpen, onEscape: onClose });

  /*
    `role="menu"` is a promise about the keyboard too: one item in the tab sequence,
    Up/Down between the rest, Home/End to the ends. This shipped as three native
    buttons — three tab stops — with no key handler at all, so the role described a
    widget that did not exist.

    Vertical, not horizontal: a dropped menu is a surface the reader has
    deliberately entered, and Up/Down is the only shape they will try there. And
    unlike a tablist, selection does NOT follow focus — arrowing onto "Sign out"
    must not sign anybody out.
  */
  const [cursor, setCursor] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const count = items.length;

  // Reset on close rather than on open: the trap's autofocus effect runs before
  // this one, so resetting on open would focus last session's item and then move
  // the tab stop out from under it.
  useEffect(() => {
    if (!isOpen) setCursor(0);
  }, [isOpen]);

  const onItemKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, count, 'vertical');
      if (next === null) return;
      // Up/Down on a focused control scrolls the page behind the menu otherwise,
      // which slides the surface out from under the cursor it is meant to move.
      event.preventDefault();
      setCursor(next);
      itemRefs.current[next]?.focus();
    },
    [count],
  );

  if (!isOpen) return null;

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="User menu"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="fixed top-16 right-4 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {user.avatar ? (
              /*
                `alt={user.name}` sat two nodes away from a <p> holding the same
                string, so a reader announced the name twice before the address.
                An avatar beside its own label carries no information of its own.
              */
              <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div
                className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 text-white text-sm font-medium"
                aria-hidden="true"
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>

        {count > 0 && (
          <div className="py-1" role="menu">
            {items.map((item, index) => (
              <React.Fragment key={item.key}>
                {/*
                  The divider was a bare <div> directly inside `role="menu"`, whose
                  children may only be menuitem/group/separator — an unroled child
                  there is a hole in the structure a reader walks. It also has to
                  drop when it would lead the list, which it does whenever the
                  entries above it were not passed.
                */}
                {item.separated && index > 0 && (
                  <div className="border-t border-gray-100 my-1" role="separator" />
                )}
                <button
                  // A dropdown is exactly the thing a consumer mounts inside a
                  // <form>, where a bare <button> submits it — and "Sign out"
                  // posting the form instead is the worst version of that.
                  type="button"
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  onClick={item.onSelect}
                  onKeyDown={(event) => onItemKeyDown(event, index)}
                  role="menuitem"
                  tabIndex={rovingTabIndex(index, cursor)}
                  className={`flex items-center gap-3 w-full min-h-[44px] sm:min-h-0 px-4 py-2 text-sm focus:outline-none ${
                    item.danger
                      ? 'text-red-600 hover:bg-red-50 focus:bg-red-50'
                      : 'text-gray-700 hover:bg-gray-100 focus:bg-gray-100'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
