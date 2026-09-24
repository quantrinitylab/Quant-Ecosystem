// ============================================================================
// QuantGram (QuantNeon) — Profile 4-Tab Matrix & Multi-Account Switcher Engine
// Forensic 98-Screen Instagram Parity (Task W39-G04)
// ============================================================================

export type ProfileTab = 'posts' | 'reels' | 'saved' | 'tagged';

export interface AccountProfileItem {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  isVerified?: boolean;
  unreadCount?: number;
  isCurrent?: boolean;
}

export interface ProfileStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  reelsCount: number;
  savedCount: number;
}

export const PROFILE_TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: 'posts', label: 'Posts', icon: '▦' },
  { id: 'reels', label: 'Reels', icon: '▶' },
  { id: 'saved', label: 'Saved', icon: '🔖' },
  { id: 'tagged', label: 'Tagged', icon: '👤' },
];

export function selectProfileTab(
  current: ProfileTab,
  target: ProfileTab,
): { activeTab: ProfileTab; isChanged: boolean } {
  return {
    activeTab: target,
    isChanged: current !== target,
  };
}

export function switchAccount(
  accounts: AccountProfileItem[],
  targetAccountId: string,
): { accounts: AccountProfileItem[]; currentAccount: AccountProfileItem | null } {
  let matched: AccountProfileItem | null = null;

  const updated = accounts.map((acc) => {
    if (acc.id === targetAccountId) {
      matched = { ...acc, isCurrent: true };
      return matched;
    }
    return { ...acc, isCurrent: false };
  });

  return {
    accounts: updated,
    currentAccount: matched,
  };
}

export function getAccountTotalUnreadCount(accounts: AccountProfileItem[]): number {
  return accounts.reduce((sum, acc) => (acc.isCurrent ? sum : sum + (acc.unreadCount || 0)), 0);
}
