import { describe, it, expect, beforeEach } from 'vitest';
import { CoinWallet } from '../coins/wallet.js';
import { SelfBoostEngine } from '../boost/boost-engine.js';
import { BoostPackRegistry } from '../boost/boost-packs.js';

describe('Self-Boost Engine', () => {
  let wallet: CoinWallet;
  let packRegistry: BoostPackRegistry;
  let boostEngine: SelfBoostEngine;

  beforeEach(() => {
    wallet = new CoinWallet();
    wallet.createWallet('user-1');
    wallet.creditCoins('user-1', 1000, 'seed');
    packRegistry = new BoostPackRegistry();
    boostEngine = new SelfBoostEngine(wallet, packRegistry);
  });

  it('should deduct coins when boosting a post', () => {
    const result = boostEngine.boostPost('user-1', 'post-1', 'basic');
    expect(result.success).toBe(true);
    expect(wallet.getBalance('user-1')).toBe(900); // 1000 - 100
  });

  it('should track boost analytics', () => {
    const result = boostEngine.boostPost('user-1', 'post-1', 'standard');
    const analytics = boostEngine.getBoostAnalytics(result.boost!.id);
    expect(analytics).toBeDefined();
    expect(analytics!.reachMultiplier).toBe(5);
    expect(analytics!.impressions).toBe(0);
  });

  it('should have NO sponsored label on boosts', () => {
    const result = boostEngine.boostPost('user-1', 'post-1', 'basic');
    expect(result.boost!.sponsored).toBe(false);
  });

  it('should use organic reach multiplier (distinct from ad model)', () => {
    const result = boostEngine.boostPost('user-1', 'post-1', 'premium');
    const boost = boostEngine.getBoost(result.boost!.id);
    // Boost uses multiplier, not CPM/CPC billing
    expect(boost!.multiplier).toBe(10);
    expect(boost).not.toHaveProperty('billingModel');
    expect(boost).not.toHaveProperty('budget');
  });

  it('should support tiered pack pricing', () => {
    const packs = packRegistry.getAllPacks();
    const basic = packs.find((p) => p.id === 'basic');
    const standard = packs.find((p) => p.id === 'standard');
    const premium = packs.find((p) => p.id === 'premium');

    expect(basic?.costCoins).toBe(100);
    expect(basic?.multiplier).toBe(2);
    expect(standard?.costCoins).toBe(250);
    expect(standard?.multiplier).toBe(5);
    expect(premium?.costCoins).toBe(500);
    expect(premium?.multiplier).toBe(10);
  });

  it('should reject boost if insufficient coins', () => {
    wallet.debitCoins('user-1', 900, 'drain'); // leave 100 coins
    const result = boostEngine.boostPost('user-1', 'post-1', 'premium'); // costs 500
    expect(result.success).toBe(false);
    expect(result.message).toContain('Insufficient balance');
  });

  it('should record impressions and update organic reach', () => {
    const result = boostEngine.boostPost('user-1', 'post-1', 'basic');
    boostEngine.recordBoostImpression(result.boost!.id);
    boostEngine.recordBoostImpression(result.boost!.id);
    const analytics = boostEngine.getBoostAnalytics(result.boost!.id);
    expect(analytics!.impressions).toBe(2);
    expect(analytics!.organicReach).toBe(4); // 2 impressions * 2x multiplier
  });
});
