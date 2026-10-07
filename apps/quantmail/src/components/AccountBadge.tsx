'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { useOptionalAuth } from '../providers/auth-provider';

interface StoredAccount {
  id: string;
  email: string;
  displayName: string;
  token?: string;
}

const STORAGE_ACCOUNTS_KEY = 'quant_known_accounts';

/**
 * Every focusable row of the menu.
 *
 * AnchoredMenu.tsx asks for `[role="menuitem"]` alone, which is right for a flat
 * action list; here the live account is a `menuitemradio`, so it has to be named
 * too or the arrows skip straight past the accounts.
 */
const MENU_ITEMS = '[role="menuitem"],[role="menuitemradio"]';

/**
 * Height budget used when clamping the portaled menu into the viewport.
 * The menu is also `max-h-[min(70vh,480px)]` scrollable, so this only matters
 * for the initial placement math.
 */
const MENU_HEIGHT_BUDGET = 480;

/** Fixed-position coordinates for the portaled menu, measured off the trigger. */
interface MenuCoords {
  top: number;
  /** Right offset for the header (compact) variant. */
  right?: number;
  /** Left offset + explicit width for the sidebar (non-compact) variant. */
  left?: number;
  width?: number;
}

/** Deterministic gradient from a string, so each identity has a stable color. */
function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || name[0] || 'Q').toUpperCase();
}

/** Signed-in identity block for the active sidebar footer with Multi-Account switching. */
export function AccountBadge({ compact = false }: { compact?: boolean } = {}) {
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const logout = auth?.logout ?? (async () => {});
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync current user into accounts list
  useEffect(() => {
    if (!user) return;
    try {
      const stored = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
      let list: StoredAccount[] = stored ? JSON.parse(stored) : [];
      const currentEmail = user.email.toLowerCase();
      const existingIdx = list.findIndex((a) => a.email.toLowerCase() === currentEmail);
      const currentAcc: StoredAccount = {
        id: user.id || currentEmail,
        email: user.email,
        displayName: user.displayName || user.username || user.email.split('@')[0],
      };
      if (existingIdx >= 0) {
        list[existingIdx] = currentAcc;
      } else {
        list.push(currentAcc);
      }
      localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(list));
      setAccounts(list);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      // The menu is portaled to document.body (see below), so it is not inside
      // the wrapper `ref` — both have to be treated as "inside the menu".
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      /*
        The open menu holds focus (see the effect below), so tearing it down
        without a destination leaves focus on `body` and the next Tab starts from
        the top of the document. mousedown runs before the browser moves focus to
        whatever was clicked, so handing focus back to the trigger here is safe:
        a focusable click target still wins it a moment later.
      */
      const hadFocus =
        ref.current?.contains(document.activeElement) ||
        menuRef.current?.contains(document.activeElement);
      setOpen(false);
      if (hadFocus) triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  /**
   * The menu is portaled to `document.body` with `position: fixed`, so it
   * escapes every ancestor stacking context — notably the app header's
   * `backdrop-blur`, which used to trap the absolutely-positioned menu *below*
   * the reading pane (invisible to sighted mouse users, though keyboard focus
   * still worked because the menu stayed in the accessibility tree).
   *
   * Same machinery as AnchoredMenu: measure the trigger, clamp into the
   * viewport, re-measure on scroll/resize because a fixed menu does not follow
   * its anchor.
   */
  const reposition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;
    if (compact) {
      // Header variant: hangs below the trigger, right-aligned to it.
      const right = Math.max(16, window.innerWidth - triggerRect.right);
      const top = Math.max(
        8,
        Math.min(window.innerHeight - MENU_HEIGHT_BUDGET, triggerRect.bottom + 8),
      );
      setMenuCoords((prev) =>
        prev && prev.top === top && prev.right === right && prev.left === undefined
          ? prev
          : { top, right },
      );
    } else {
      // Sidebar variant: opens upward, spanning the badge wrapper's padding box
      // (the old `left-3 right-3` of the `px-3` wrapper).
      const wrapperRect = ref.current?.getBoundingClientRect();
      if (!wrapperRect) return;
      const left = wrapperRect.left + 12;
      const width = Math.max(200, wrapperRect.width - 24);
      const top = Math.max(8, triggerRect.top - MENU_HEIGHT_BUDGET - 8);
      setMenuCoords((prev) =>
        prev && prev.top === top && prev.left === left && prev.width === width
          ? prev
          : { top, left, width },
      );
    }
  }, [compact]);

  useEffect(() => {
    if (!open) {
      setMenuCoords(null);
      return;
    }
    reposition();
    window.addEventListener('resize', reposition);
    // Capture phase: scrolls happen in nested containers and do not bubble.
    document.addEventListener('scroll', reposition, true);
    // Wait a frame for the portaled menu to mount at the measured coords
    // before moving focus into it, so focus never lands on a stale position.
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>(MENU_ITEMS)?.focus();
    });
    return () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
      window.cancelAnimationFrame(frame);
    };
  }, [open, reposition]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  /**
   * The menu owns the keyboard while it is out.
   *
   * Both listeners here used to be attached with an empty dependency array, so
   * they ran for the whole session: every Escape anywhere in the app — closing a
   * compose window, clearing a search — also called `setOpen(false)` on a menu
   * that was already shut, and the outside-click handler ran on every click in
   * the product. Scoping it means the binding exists only while it can do
   * something, and masking stops `j`/`k` from walking the list underneath.
   */
  useKeyboardScope('account-menu', { active: open, exclusive: true });

  useShortcut('escape', close, { scope: 'account-menu', label: 'Close account menu' });

  /*
    `role="menu"` is a promise about the keyboard, not a label: focus moves into the
    menu when it opens, Up/Down walk it, and the trigger stays the only tab stop.
    This panel declared the role and delivered none of it — every button was its own
    tab stop and the arrows scrolled the inbox behind it.

    Lifted from AnchoredMenu.tsx, which already solves this for the row menus, so the
    two stay the same shape: focus is read off the live DOM rather than mirrored into
    state, because the list is short and a queried index cannot drift out of sync with
    what is rendered.
  */
  const moveFocus = useCallback((delta: number) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(MENU_ITEMS) ?? [],
    );
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    // From outside the list, ArrowDown enters at the top and ArrowUp at the bottom.
    const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : current + delta;
    items[(next + items.length) % items.length]?.focus();
  }, []);

  useShortcut('arrowdown', () => moveFocus(1), { scope: 'account-menu', label: 'Next option' });
  useShortcut('arrowup', () => moveFocus(-1), {
    scope: 'account-menu',
    label: 'Previous option',
  });

  if (!user) return null;

  const name = user.displayName || user.username || 'Account';
  const address = user.email;

  const handleSwitchAccount = (account: StoredAccount) => {
    setOpen(false);
    if (account.email.toLowerCase() === user.email.toLowerCase()) return;
    // Redirect to switch/login or reload with account context
    router.push(`/login?switch_to=${encodeURIComponent(account.email)}`);
  };

  const handleAddAccount = () => {
    setOpen(false);
    router.push('/login?add_account=true');
  };

  return (
    <div ref={ref} className={compact ? 'relative' : 'relative px-3 pb-3 pt-1'}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu: ${name}`}
        aria-controls={open ? 'account-badge-menu' : undefined}
        className={
          compact
            ? 'flex size-8 items-center justify-center rounded-full border border-[#282C35] hover:border-[#FF8C42]/50 hover:bg-[#161922] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]'
            : 'flex w-full items-center gap-2.5 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--quant-muted)]'
        }
      >
        <span
          className={
            compact
              ? 'flex size-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white shadow-sm'
              : 'flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm'
          }
          style={{ background: gradientFor(address) }}
          aria-hidden="true"
        >
          {initials(name)}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[var(--quant-foreground)]">
                {name}
              </span>
              <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
                {address}
              </span>
            </span>
            <span
              className="text-xs text-[var(--quant-muted-foreground)] flex items-center justify-center"
              aria-hidden="true"
            >
              <svg
                className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </>
        )}
      </button>

      {open &&
        menuCoords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id="account-badge-menu"
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            aria-label="Account"
            onKeyDown={(event) => {
              // A menu is not a place to Tab through. Leave, and let focus land outside.
              if (event.key === 'Tab') setOpen(false);
            }}
            /*
              Portaled to document.body with position:fixed + root-level z-index,
              so the menu escapes every ancestor stacking context (the app
              header's backdrop-blur used to trap it *below* the reading pane:
              invisible to mouse users, though keyboard focus still worked).
              Same approach as AnchoredMenu's popovers.
            */
            style={{
              position: 'fixed',
              top: menuCoords.top,
              ...(menuCoords.right !== undefined
                ? { right: menuCoords.right }
                : { left: menuCoords.left, width: menuCoords.width }),
              zIndex: 99999,
            }}
            className={`overflow-y-auto rounded-2xl border border-[#282C35] bg-[#16181D] shadow-2xl animate-scale-in max-h-[min(70vh,480px)] ${
              compact ? 'w-64' : ''
            }`}
          >
          {/*
            Multi-Account Switcher Section. `role="none"` on the padding wrapper:
            a bare <div> is `role=generic`, and ARIA 1.2 does not let `menu` own one
            — so the two sections used to swallow every item and the menu read as
            empty. Presentational here, so the menu owns what is inside directly.
          */}
          <div role="none" className="p-2 border-b border-[#282C35] space-y-1">
            <p
              aria-hidden="true"
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#A1A4AC]"
            >
              Accounts ({accounts.length})
            </p>
            {/*
              One of these accounts is the live one and the tick says which, so they
              are radios and `aria-checked` says out loud what the tick draws. The
              name lives on the group because a paragraph is not something a menu is
              allowed to own — hence `aria-hidden` on the heading above.
            */}
            <div role="group" aria-label={`Accounts (${accounts.length})`} className="space-y-1">
              {accounts.map((acc) => {
                const isCurrent = acc.email.toLowerCase() === user.email.toLowerCase();
                return (
                  <button
                    key={acc.email}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    tabIndex={-1}
                    onClick={() => handleSwitchAccount(acc)}
                    className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                      isCurrent
                        ? 'bg-[#FF8C42]/10 border border-[#FF8C42]/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                        : 'hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: gradientFor(acc.email) }}
                        aria-hidden="true"
                      >
                        {initials(acc.displayName || acc.email)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate leading-tight">
                          {acc.displayName}
                        </p>
                        <p className="text-[10px] text-[#A1A4AC] truncate leading-tight">
                          {acc.email}
                        </p>
                      </div>
                    </div>
                    {isCurrent && (
                      <svg
                        className="size-3.5 text-[#FF8C42] shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={handleAddAccount}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-[#FF8C42] hover:bg-[#FF8C42]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <span
                className="size-5 rounded-lg bg-[#FF8C42]/10 border border-[#FF8C42]/30 flex items-center justify-center font-bold"
                aria-hidden="true"
              >
                +
              </span>
              <span>Add another account</span>
            </button>
          </div>

          {/* Quick Actions */}
          <div role="none" className="p-1 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                router.push('/settings');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:text-white hover:bg-[#1C1F26] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <svg
                className="size-3.5 text-[#A1A4AC]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Settings & Preferences</span>
            </button>

            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                router.push('/security');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:text-white hover:bg-[#1C1F26] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <svg
                className="size-3.5 text-[#A1A4AC]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Security & 2FA</span>
            </button>

            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={async () => {
                setOpen(false);
                await logout();
                router.push('/login');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <svg
                className="size-3.5 text-rose-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
