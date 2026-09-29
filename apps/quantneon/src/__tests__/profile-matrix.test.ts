import { describe, expect, it } from 'vitest';
import {
  PROFILE_TABS,
  getAccountTotalUnreadCount,
  selectProfileTab,
  switchAccount,
  type AccountProfileItem,
} from '../features/profile/profile-matrix';

describe('QuantGram Profile 4-Tab Matrix & Multi-Account Switcher (Task W39-G04)', () => {
  it('defines the complete 4-tab forensic matrix (Posts, Reels, Saved, Tagged)', () => {
    expect(PROFILE_TABS).toHaveLength(4);
    expect(PROFILE_TABS.map((t) => t.id)).toEqual(['posts', 'reels', 'saved', 'tagged']);
  });

  it('handles tab selection and transition states accurately', () => {
    const transition = selectProfileTab('posts', 'saved');
    expect(transition.activeTab).toBe('saved');
    expect(transition.isChanged).toBe(true);

    const sameTab = selectProfileTab('saved', 'saved');
    expect(sameTab.isChanged).toBe(false);
  });

  it('switches active account atomically and updates current flag', () => {
    const accounts: AccountProfileItem[] = [
      {
        id: 'acc-1',
        username: 'alex_creator',
        displayName: 'Alex Creator',
        avatar: '/alex.png',
        isCurrent: true,
        unreadCount: 0,
      },
      {
        id: 'acc-2',
        username: 'alex_personal',
        displayName: 'Alex P.',
        avatar: '/personal.png',
        isCurrent: false,
        unreadCount: 5,
      },
    ];

    const result = switchAccount(accounts, 'acc-2');
    expect(result.currentAccount?.id).toBe('acc-2');
    expect(result.currentAccount?.isCurrent).toBe(true);

    const oldAcc = result.accounts.find((a) => a.id === 'acc-1');
    expect(oldAcc?.isCurrent).toBe(false);
  });

  it('calculates unread notifications across inactive secondary accounts', () => {
    const accounts: AccountProfileItem[] = [
      {
        id: 'acc-1',
        username: 'main_user',
        displayName: 'Main User',
        avatar: '/main.png',
        isCurrent: true,
        unreadCount: 2, // Active account (ignored)
      },
      {
        id: 'acc-2',
        username: 'brand_quant',
        displayName: 'Brand Account',
        avatar: '/brand.png',
        isCurrent: false,
        unreadCount: 7,
      },
      {
        id: 'acc-3',
        username: 'gaming_hub',
        displayName: 'Gaming Hub',
        avatar: '/gaming.png',
        isCurrent: false,
        unreadCount: 3,
      },
    ];

    const totalUnread = getAccountTotalUnreadCount(accounts);
    expect(totalUnread).toBe(10); // 7 + 3
  });
});
