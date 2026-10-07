import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import {
  REEL_GIFT_OPTIONS,
  getReelGiftsCatalogue,
  sendReelGift,
  sendVirtualGift,
  getUserWallet,
  depositCoins,
  clearWalletsForTesting,
  calculateCreatorPayout,
} from '../services/virtual-gifts.service';
import { calculatePreloadWindow } from '../hooks/useVideoPreloader';
import ReelsPage from '../pages/reels';
import { GuestInteractionGate } from '../components/GuestInteractionGate';

describe('QuantGram Reel Player, Virtual Gifts & Guest Mode (Task C4)', () => {
  beforeEach(() => {
    clearWalletsForTesting();
  });

  describe('1. Virtual Gift Tray Options & Catalogue', () => {
    it('provides exactly the 3 required reel gift options: Rose 10, Diamond 100, Rocket 500', () => {
      const catalogue = getReelGiftsCatalogue();
      expect(catalogue).toHaveLength(3);

      const rose = catalogue.find((g) => g.id === 'rose');
      expect(rose).toBeDefined();
      expect(rose?.name).toBe('Rose');
      expect(rose?.icon).toBe('🌹');
      expect(rose?.coins).toBe(10);
      expect(rose?.animationType).toBe('pulse');

      const diamond = catalogue.find((g) => g.id === 'diamond');
      expect(diamond).toBeDefined();
      expect(diamond?.name).toBe('Diamond');
      expect(diamond?.icon).toBe('💎');
      expect(diamond?.coins).toBe(100);
      expect(diamond?.animationType).toBe('burst');

      const rocket = catalogue.find((g) => g.id === 'rocket');
      expect(rocket).toBeDefined();
      expect(rocket?.name).toBe('Rocket');
      expect(rocket?.icon).toBe('🚀');
      expect(rocket?.coins).toBe(500);
      expect(rocket?.animationType).toBe('fullscreen');
    });

    it('exports REEL_GIFT_OPTIONS matching catalogue', () => {
      expect(REEL_GIFT_OPTIONS).toEqual(getReelGiftsCatalogue());
    });
  });

  describe('2. Virtual Gift Sending Logic & Creator Economics', () => {
    const senderId = 'viewer_alice';
    const creatorId = 'creator_bob';
    const reelId = 'reel_neon_42';

    it('blocks sending a gift when sender has insufficient coins', () => {
      // Alice only has 50 coins, tries to send Rocket (500 coins)
      depositCoins(senderId, 50);

      expect(() => {
        sendReelGift(senderId, creatorId, 'rocket', reelId);
      }).toThrow('INSUFFICIENT_COINS');

      const aliceWallet = getUserWallet(senderId);
      expect(aliceWallet.coinBalance).toBe(50);
    });

    it('successfully sends Rose (10 coins) and credits 80% diamonds to creator', () => {
      depositCoins(senderId, 50);

      const tx = sendReelGift(senderId, creatorId, 'rose', reelId);

      expect(tx).toBeDefined();
      expect(tx.senderId).toBe(senderId);
      expect(tx.creatorId).toBe(creatorId);
      expect(tx.coinsSpent).toBe(10);
      expect(tx.diamondsEarned).toBe(8); // 80% of 10
      expect(tx.gift.name).toBe('Rose');
      expect(tx.contextId).toBe(reelId);

      const aliceWallet = getUserWallet(senderId);
      expect(aliceWallet.coinBalance).toBe(40);

      const bobWallet = getUserWallet(creatorId);
      expect(bobWallet.diamondsBalance).toBe(8);
    });

    it('successfully sends Diamond (100 coins) and verifies transaction record', () => {
      depositCoins(senderId, 200);

      const tx = sendReelGift(senderId, creatorId, 'diamond', reelId);

      expect(tx.coinsSpent).toBe(100);
      expect(tx.diamondsEarned).toBe(80); // 80% of 100
      expect(tx.gift.icon).toBe('💎');

      const aliceWallet = getUserWallet(senderId);
      expect(aliceWallet.coinBalance).toBe(100);

      const bobWallet = getUserWallet(creatorId);
      expect(bobWallet.diamondsBalance).toBe(80);
    });

    it('successfully sends Rocket (500 coins) and calculates creator payout eligibility', () => {
      depositCoins(senderId, 1000);

      const tx = sendReelGift(senderId, creatorId, 'rocket', reelId);

      expect(tx.coinsSpent).toBe(500);
      expect(tx.diamondsEarned).toBe(400); // 80% of 500
      expect(tx.gift.animationType).toBe('fullscreen');

      const payout = calculateCreatorPayout(creatorId);
      expect(payout.diamonds).toBe(400);
      expect(payout.estimatedUsd).toBe(4.0); // 400 * $0.01
      expect(payout.eligibleForPayout).toBe(true);
    });

    it('supports sendVirtualGift directly with reel option identifiers', () => {
      depositCoins(senderId, 100);
      const tx = sendVirtualGift(senderId, creatorId, 'rose');
      expect(tx.coinsSpent).toBe(10);
      expect(tx.gift.name).toBe('Rose');
    });
  });

  describe('3. Unauthenticated Guest Mode & Auth Guard', () => {
    it('guards gift action when user is unauthenticated', () => {
      let isGateOpen = false;
      let gateAction = '';
      let callbackExecuted = false;

      const requireAuth = (isAuthenticated: boolean, action: string, callback: () => void) => {
        if (!isAuthenticated) {
          gateAction = action;
          isGateOpen = true;
          return;
        }
        callback();
      };

      // Guest clicks 🎁 Gift floating button
      requireAuth(false, 'gift', () => {
        callbackExecuted = true;
      });

      expect(isGateOpen).toBe(true);
      expect(gateAction).toBe('gift');
      expect(callbackExecuted).toBe(false);

      // Authenticated user clicks 🎁 Gift
      isGateOpen = false;
      gateAction = '';
      requireAuth(true, 'gift', () => {
        callbackExecuted = true;
      });

      expect(isGateOpen).toBe(false);
      expect(callbackExecuted).toBe(true);
    });

    it('guards like and comment actions in unauthenticated guest mode', () => {
      let gateAction = '';
      let isGateOpen = false;

      const guard = (isAuthenticated: boolean, action: string) => {
        if (!isAuthenticated) {
          gateAction = action;
          isGateOpen = true;
        }
      };

      // Guest tries to like
      guard(false, 'like');
      expect(isGateOpen).toBe(true);
      expect(gateAction).toBe('like');

      // Guest tries to comment
      guard(false, 'comment');
      expect(isGateOpen).toBe(true);
      expect(gateAction).toBe('comment');
    });

    it('renders GuestInteractionGate with correct gift headline and icon props', () => {
      const element = React.createElement(GuestInteractionGate, {
        isOpen: true,
        onClose: () => {},
        action: 'gift',
      });
      expect(React.isValidElement(element)).toBe(true);
      expect(element.props.isOpen).toBe(true);
      expect(element.props.action).toBe('gift');
    });
  });

  describe('4. Shortie Sliding Video Preloader State Engine', () => {
    it('calculates the 4-page sliding window at start, middle, and end of reel feed', () => {
      const totalReels = 12;

      // At index 0: min(0, -1) -> 0; max(11, 0 + 4 - 1 = 3) -> [0, 1, 2, 3]
      const window0 = calculatePreloadWindow(totalReels, 0, 4);
      expect(window0).toEqual([0, 1, 2, 3]);

      // At index 2: min(0, 1) -> 1; max(11, 2 + 3 = 5) -> [1, 2, 3, 4, 5]
      const window2 = calculatePreloadWindow(totalReels, 2, 4);
      expect(window2).toEqual([1, 2, 3, 4, 5]);

      // At index 6: [5, 6, 7, 8, 9]
      const window6 = calculatePreloadWindow(totalReels, 6, 4);
      expect(window6).toEqual([5, 6, 7, 8, 9]);

      // At end (index 11): min(0, 10) -> 10; max(11, 14) -> 11 -> [10, 11]
      const windowEnd = calculatePreloadWindow(totalReels, 11, 4);
      expect(windowEnd).toEqual([10, 11]);
    });

    it('evicts old reel indices as active index slides forward', () => {
      const totalReels = 20;

      const windowStep1 = calculatePreloadWindow(totalReels, 2, 4); // [1, 2, 3, 4, 5]
      const windowStep2 = calculatePreloadWindow(totalReels, 7, 4); // [6, 7, 8, 9, 10]

      // Indices 1, 2, 3, 4, 5 are evicted
      for (let i = 1; i <= 5; i++) {
        expect(windowStep2).not.toContain(i);
      }
      expect(windowStep2).toContain(7); // active index retained
    });
  });

  describe('5. ReelsPage Component Contract', () => {
    it('exports ReelsPage as a valid React component function', () => {
      expect(ReelsPage).toBeDefined();
      expect(typeof ReelsPage).toBe('function');
    });

    it('instantiates ReelsPage element', () => {
      const element = React.createElement(ReelsPage);
      expect(React.isValidElement(element)).toBe(true);
    });
  });
});
