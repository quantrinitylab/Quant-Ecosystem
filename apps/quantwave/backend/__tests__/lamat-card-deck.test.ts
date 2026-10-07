// ============================================================================
// Lamat v3.2.0 Dating Card Deck & Diamond Tip Gifting Ledger Unit Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordDeckSwipe,
  undoLastSwipe,
  sendDiamondTip,
  updateKarmaScore,
  getUserKarma,
  clearDeckForTesting,
  getUserInteractions,
  getTipTransactions,
  LamatCardDeckService,
} from '../services/lamat-card-deck.service';

describe('Lamat v3.2.0 Dating Card Deck & Diamond Tip Ledger', () => {
  beforeEach(() => {
    clearDeckForTesting();
  });

  describe('Interactive Swipe Card Deck', () => {
    it('records swipes (CRUSH, LIKE, NOPE) and retrieves interactions', () => {
      const swipe1 = recordDeckSwipe('user_alice', 'user_bob', 'LIKE');
      const swipe2 = recordDeckSwipe('user_alice', 'user_charlie', 'CRUSH');
      const swipe3 = recordDeckSwipe('user_alice', 'user_dave', 'NOPE');

      expect(swipe1.id).toBeDefined();
      expect(swipe1.actorUserId).toBe('user_alice');
      expect(swipe1.targetUserId).toBe('user_bob');
      expect(swipe1.action).toBe('LIKE');
      expect(swipe1.isUndone).toBe(false);
      expect(swipe1.timestamp).toBeDefined();

      expect(swipe2.action).toBe('CRUSH');
      expect(swipe3.action).toBe('NOPE');

      const interactions = getUserInteractions('user_alice');
      expect(interactions).toHaveLength(3);
      expect(interactions.map((i) => i.targetUserId)).toEqual([
        'user_bob',
        'user_charlie',
        'user_dave',
      ]);
    });

    it('undoes last swipe, marks interaction as undone, and consumes an undo token', () => {
      recordDeckSwipe('user_alice', 'user_bob', 'NOPE');
      recordDeckSwipe('user_alice', 'user_charlie', 'NOPE');

      const initialProfile = getUserKarma('user_alice');
      expect(initialProfile.undoTokensCount).toBe(3);

      const undoResult = undoLastSwipe('user_alice');
      expect(undoResult.success).toBe(true);
      expect(undoResult.undoneInteraction?.targetUserId).toBe('user_charlie');
      expect(undoResult.undoneInteraction?.isUndone).toBe(true);

      const updatedProfile = getUserKarma('user_alice');
      expect(updatedProfile.undoTokensCount).toBe(2);

      // Undoing again should undo the previous one (user_bob)
      const secondUndoResult = undoLastSwipe('user_alice');
      expect(secondUndoResult.success).toBe(true);
      expect(secondUndoResult.undoneInteraction?.targetUserId).toBe('user_bob');
      expect(secondUndoResult.undoneInteraction?.isUndone).toBe(true);
      expect(getUserKarma('user_alice').undoTokensCount).toBe(1);
    });

    it('returns error when there are no active swipes to undo', () => {
      const result = undoLastSwipe('user_alice');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_SWIPES_TO_UNDO');
      // Undo tokens should not be deducted if there are no swipes to undo
      expect(getUserKarma('user_alice').undoTokensCount).toBe(3);
    });

    it('throws NO_UNDO_TOKENS when no undo tokens remain', () => {
      recordDeckSwipe('user_alice', 'user_1', 'NOPE');
      recordDeckSwipe('user_alice', 'user_2', 'NOPE');
      recordDeckSwipe('user_alice', 'user_3', 'NOPE');
      recordDeckSwipe('user_alice', 'user_4', 'NOPE');

      // Use up 3 tokens
      undoLastSwipe('user_alice'); // tokens -> 2
      undoLastSwipe('user_alice'); // tokens -> 1
      undoLastSwipe('user_alice'); // tokens -> 0

      const profile = getUserKarma('user_alice');
      expect(profile.undoTokensCount).toBe(0);

      // Attempting 4th undo with 0 tokens must throw NO_UNDO_TOKENS
      expect(() => undoLastSwipe('user_alice')).toThrow('NO_UNDO_TOKENS');
    });
  });

  describe('Diamond Tip Gifting Ledger', () => {
    it('splits 5% platform fee and deducts sender balance properly', () => {
      const { transaction, remainingBalance } = sendDiamondTip(
        'user_sender',
        'user_creator',
        100, // 100 diamonds
        500, // balance: 500
        'post_999',
        'Amazing stream!',
      );

      // 5% of 100 = 5, creator gets 95
      expect(transaction.id).toBeDefined();
      expect(transaction.senderUserId).toBe('user_sender');
      expect(transaction.recipientUserId).toBe('user_creator');
      expect(transaction.diamondAmount).toBe(100);
      expect(transaction.platformFeeDiamonds).toBe(5);
      expect(transaction.creatorNetDiamonds).toBe(95);
      expect(transaction.postOrProfileId).toBe('post_999');
      expect(transaction.note).toBe('Amazing stream!');
      expect(transaction.createdAt).toBeDefined();

      expect(remainingBalance).toBe(400);

      const allTips = getTipTransactions();
      expect(allTips).toHaveLength(1);
    });

    it('calculates floor for platform fee with non-round diamond amounts', () => {
      // 5% of 50 = 2.5 -> floor is 2, creator net is 48
      const { transaction, remainingBalance } = sendDiamondTip(
        'user_sender',
        'user_creator',
        50,
        100,
      );

      expect(transaction.platformFeeDiamonds).toBe(2);
      expect(transaction.creatorNetDiamonds).toBe(48);
      expect(remainingBalance).toBe(50);
    });

    it('throws error when balance is insufficient', () => {
      expect(() => {
        sendDiamondTip('user_sender', 'user_creator', 200, 50);
      }).toThrow('INSUFFICIENT_DIAMOND_BALANCE');
    });

    it('throws error when diamond amount is zero or negative', () => {
      expect(() => {
        sendDiamondTip('user_sender', 'user_creator', 0, 100);
      }).toThrow('INVALID_DIAMOND_AMOUNT');

      expect(() => {
        sendDiamondTip('user_sender', 'user_creator', -10, 100);
      }).toThrow('INVALID_DIAMOND_AMOUNT');
    });
  });

  describe('Community Karma & Moderation Tiers', () => {
    it('initializes default user karma profile with SILVER tier and 3 undo tokens', () => {
      const profile = getUserKarma('user_alice');
      expect(profile.userId).toBe('user_alice');
      expect(profile.karmaScore).toBe(100);
      expect(profile.tier).toBe('SILVER');
      expect(profile.isRestricted).toBe(false);
      expect(profile.flagCount).toBe(0);
      expect(profile.undoTokensCount).toBe(3);
    });

    it('evaluates tier transitions correctly across score thresholds', () => {
      // BRONZE: < 100
      const bronzeProfile = updateKarmaScore('user_alice', -30);
      expect(bronzeProfile.karmaScore).toBe(70);
      expect(bronzeProfile.tier).toBe('BRONZE');

      // SILVER: 100..499
      const silverProfile = updateKarmaScore('user_alice', 130);
      expect(silverProfile.karmaScore).toBe(200);
      expect(silverProfile.tier).toBe('SILVER');

      // GOLD: 500..999
      const goldProfile = updateKarmaScore('user_alice', 350);
      expect(goldProfile.karmaScore).toBe(550);
      expect(goldProfile.tier).toBe('GOLD');

      // PLATINUM: >= 1000
      const platinumProfile = updateKarmaScore('user_alice', 500);
      expect(platinumProfile.karmaScore).toBe(1050);
      expect(platinumProfile.tier).toBe('PLATINUM');
    });

    it('enforces restriction gate when karma drops below 20', () => {
      const profile = updateKarmaScore('user_spammer', -90); // 100 - 90 = 10
      expect(profile.karmaScore).toBe(10);
      expect(profile.isRestricted).toBe(true);
    });

    it('enforces restriction gate when user receives 3 or more flags', () => {
      updateKarmaScore('user_troll', 0, 'Spam comment');
      expect(getUserKarma('user_troll').flagCount).toBe(1);
      expect(getUserKarma('user_troll').isRestricted).toBe(false);

      updateKarmaScore('user_troll', 0, 'Harassment');
      expect(getUserKarma('user_troll').flagCount).toBe(2);
      expect(getUserKarma('user_troll').isRestricted).toBe(false);

      updateKarmaScore('user_troll', 0, 'Impersonation');
      const trollProfile = getUserKarma('user_troll');
      expect(trollProfile.flagCount).toBe(3);
      expect(trollProfile.isRestricted).toBe(true);
    });
  });
});
