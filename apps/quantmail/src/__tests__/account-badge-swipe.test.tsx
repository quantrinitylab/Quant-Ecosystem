import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AccountBadge,
  ACCOUNT_SWIPE_MIN_DISTANCE,
  classifyAvatarSwipe,
  accountForAvatarSwipe,
} from '../components/AccountBadge';

// Mock Next.js navigation hooks
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock auth: the avatar mounts only for a signed-in user.
vi.mock('../providers/auth-provider', () => ({
  useOptionalAuth: () => ({
    user: { id: 'u1', email: 'a@quantmail.in', displayName: 'A User', username: 'a' },
    logout: vi.fn(),
  }),
  useAuth: () => {
    throw new Error('useAuth must be used within an AuthProvider');
  },
}));

const ACCOUNTS = [
  { id: 'u1', email: 'a@quantmail.in', displayName: 'A User' },
  { id: 'u2', email: 'b@quantmail.in', displayName: 'B User' },
  { id: 'u3', email: 'c@quantmail.in', displayName: 'C User' },
];

describe('AccountBadge — avatar-swipe account switch (mobile-inbox P2)', () => {
  describe('classifyAvatarSwipe', () => {
    it('classifies a downward drag past the threshold as a down swipe', () => {
      expect(classifyAvatarSwipe(100, 100, 100, 100 + ACCOUNT_SWIPE_MIN_DISTANCE)).toBe('down');
      expect(classifyAvatarSwipe(100, 100, 102, 200)).toBe('down');
    });

    it('classifies an upward drag past the threshold as an up swipe', () => {
      expect(classifyAvatarSwipe(100, 200, 100, 200 - ACCOUNT_SWIPE_MIN_DISTANCE)).toBe('up');
      expect(classifyAvatarSwipe(100, 200, 98, 100)).toBe('up');
    });

    it('ignores taps and short drags so taps still open the menu', () => {
      expect(classifyAvatarSwipe(100, 100, 100, 100)).toBeNull();
      expect(classifyAvatarSwipe(100, 100, 100, 100 + ACCOUNT_SWIPE_MIN_DISTANCE - 1)).toBeNull();
      expect(classifyAvatarSwipe(100, 100, 100, 100 - ACCOUNT_SWIPE_MIN_DISTANCE + 1)).toBeNull();
    });

    it('ignores horizontal drags so they keep scrolling the page', () => {
      expect(classifyAvatarSwipe(100, 100, 200, 100)).toBeNull();
      expect(classifyAvatarSwipe(100, 100, 200, 150)).toBeNull();
      expect(classifyAvatarSwipe(100, 100, 0, 150)).toBeNull();
    });
  });

  describe('accountForAvatarSwipe', () => {
    it('swipe down moves to the next account, wrapping from last to first', () => {
      expect(accountForAvatarSwipe(ACCOUNTS, 'a@quantmail.in', 'down')?.email).toBe(
        'b@quantmail.in',
      );
      expect(accountForAvatarSwipe(ACCOUNTS, 'c@quantmail.in', 'down')?.email).toBe(
        'a@quantmail.in',
      );
    });

    it('swipe up moves to the previous account, wrapping from first to last', () => {
      expect(accountForAvatarSwipe(ACCOUNTS, 'b@quantmail.in', 'up')?.email).toBe(
        'a@quantmail.in',
      );
      expect(accountForAvatarSwipe(ACCOUNTS, 'a@quantmail.in', 'up')?.email).toBe(
        'c@quantmail.in',
      );
    });

    it('is case-insensitive on the current account email', () => {
      expect(accountForAvatarSwipe(ACCOUNTS, 'B@QuantMail.in', 'down')?.email).toBe(
        'c@quantmail.in',
      );
    });

    it('returns null with fewer than two accounts — no phantom switch', () => {
      expect(accountForAvatarSwipe([], 'a@quantmail.in', 'down')).toBeNull();
      expect(accountForAvatarSwipe([ACCOUNTS[0]], 'a@quantmail.in', 'down')).toBeNull();
      expect(accountForAvatarSwipe([ACCOUNTS[0]], 'a@quantmail.in', 'up')).toBeNull();
    });

    it('anchors an unknown current account at the list ends', () => {
      expect(accountForAvatarSwipe(ACCOUNTS, 'unknown@quantmail.in', 'down')?.email).toBe(
        'a@quantmail.in',
      );
      expect(accountForAvatarSwipe(ACCOUNTS, 'unknown@quantmail.in', 'up')?.email).toBe(
        'c@quantmail.in',
      );
    });
  });

  describe('avatar trigger markup', () => {
    it('renders a swipeable trigger with a stable test id and account-menu label', () => {
      const html = renderToStaticMarkup(<AccountBadge compact={true} size="lg" />);
      expect(html).toContain('data-testid="account-badge-trigger"');
      expect(html).toContain('Account menu: A User');
      expect(html).toContain('aria-haspopup="menu"');
    });
  });
});
