import { describe, it, expect, beforeEach } from 'vitest';
import {
  getVirtualGiftsCatalogue,
  getUserWallet,
  depositCoins,
  sendVirtualGift,
  calculateCreatorPayout,
  clearWalletsForTesting,
  DEFAULT_GIFTS,
  CREATOR_SHARE_PERCENTAGE,
  DIAMOND_TO_USD_RATE,
} from '../services/virtual-gifts.service';

describe('Shortie Virtual Gifts & Creator Economy Engine', () => {
  beforeEach(() => {
    clearWalletsForTesting();
  });

  it('catalogue returns 6 standard gifts with prices', () => {
    const catalogue = getVirtualGiftsCatalogue();
    expect(catalogue).toHaveLength(6);
    expect(catalogue).toEqual(DEFAULT_GIFTS);
    expect(catalogue[0].id).toBe('gift_rose');
    expect(catalogue[0].coinCost).toBe(1);
    expect(catalogue[5].id).toBe('gift_car');
    expect(catalogue[5].coinCost).toBe(500);
  });

  it('wallet deposit increases coin balance', () => {
    const userId = 'user_viewer_1';
    let wallet = getUserWallet(userId);
    expect(wallet.coinBalance).toBe(0);

    wallet = depositCoins(userId, 100);
    expect(wallet.coinBalance).toBe(100);

    wallet = depositCoins(userId, 50);
    expect(wallet.coinBalance).toBe(150);
  });

  it('sending gift with insufficient balance throws INSUFFICIENT_COINS', () => {
    const senderId = 'poor_viewer';
    const creatorId = 'top_creator';

    // Deposit only 5 coins, but try to send Rocket (100 coins)
    depositCoins(senderId, 5);

    expect(() => {
      sendVirtualGift(senderId, creatorId, 'gift_rocket', 'stream_123');
    }).toThrow('INSUFFICIENT_COINS');
  });

  it('sending gift deducts coins from sender and credits 80% diamonds to creator', () => {
    const senderId = 'rich_viewer';
    const creatorId = 'popular_streamer';

    depositCoins(senderId, 100); // Rocket costs 100 coins

    const tx = sendVirtualGift(senderId, creatorId, 'gift_rocket', 'stream_456');

    expect(tx).toBeDefined();
    expect(tx.senderId).toBe(senderId);
    expect(tx.creatorId).toBe(creatorId);
    expect(tx.gift.id).toBe('gift_rocket');
    expect(tx.coinsSpent).toBe(100);
    // 80% of 100 = 80 diamonds
    expect(tx.diamondsEarned).toBe(80);
    expect(tx.contextId).toBe('stream_456');

    const senderWallet = getUserWallet(senderId);
    expect(senderWallet.coinBalance).toBe(0);

    const creatorWallet = getUserWallet(creatorId);
    expect(creatorWallet.diamondsBalance).toBe(80);
    expect(creatorWallet.totalEarnedDiamonds).toBe(80);
  });

  it('creator payout calculation computes USD equivalent accurately at $0.01/diamond', () => {
    const creatorId = 'artist_creator';
    const senderId = 'generous_fan';

    // Send Sports Car (500 coins) -> 80% = 400 diamonds
    depositCoins(senderId, 500);
    sendVirtualGift(senderId, creatorId, 'gift_car', 'reel_789');

    const payout = calculateCreatorPayout(creatorId);
    expect(payout.diamonds).toBe(400);
    // 400 * 0.01 = 4.00 USD
    expect(payout.estimatedUsd).toBe(4.0);
    expect(payout.eligibleForPayout).toBe(true); // >= 100 diamonds

    // Test creator with fewer than 100 diamonds
    const smallCreator = 'new_creator';
    depositCoins(senderId, 10);
    sendVirtualGift(senderId, smallCreator, 'gift_coffee');

    const smallPayout = calculateCreatorPayout(smallCreator);
    expect(smallPayout.diamonds).toBe(8); // 80% of 10 = 8
    expect(smallPayout.estimatedUsd).toBe(0.08);
    expect(smallPayout.eligibleForPayout).toBe(false); // < 100 diamonds
  });
});
