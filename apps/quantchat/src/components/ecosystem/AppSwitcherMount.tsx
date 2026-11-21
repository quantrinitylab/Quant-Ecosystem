'use client';

import { UniversalAppSwitcher } from '@quant/shared-ui';
import type { QuantUserSession } from '@quant/shared-ui';

/**
 * The minimal identity the ecosystem switcher needs. The caller (profile
 * page) passes its backend-verified `me` view — no second auth hook, no
 * session invention.
 */
export interface SwitcherIdentity {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
}

/**
 * SwitcherIdentity -> QuantUserSession adapter (pure, exported for tests).
 * QC-F-050: only fields the ecosystem switcher contract actually needs are
 * mapped — nothing is invented here.
 */
export function toQuantUserSession(u: SwitcherIdentity): QuantUserSession {
  return {
    userId: u.id,
    email: u.email,
    displayName: u.displayName,
    username: u.username,
    avatarUrl: u.avatarUrl,
    currentApp: 'quantchat',
  };
}

/**
 * Mounts the ecosystem app switcher for a logged-in user.
 *
 * QC-F-050 Slice-1: badges are intentionally NOT wired — there is no real
 * per-app unread source today, and showing the seeded demo badge counts
 * would be fabrication. Fail-closed while logged out: renders nothing.
 */
export function AppSwitcherMount({ user }: { user: SwitcherIdentity | null }) {
  if (!user) return null;
  return <UniversalAppSwitcher currentApp="quantchat" user={toQuantUserSession(user)} />;
}
