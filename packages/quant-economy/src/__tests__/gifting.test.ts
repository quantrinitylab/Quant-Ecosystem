import { describe, it, expect, beforeEach } from 'vitest';
import { CoinWallet } from '../coins/wallet.js';
import { VirtualGoodsCatalog } from '../store/catalog.js';
import { CrossAppInventory } from '../store/inventory.js';
import { GiftingService } from '../gifting/gift-service.js';
import { TippingService, PRESET_TIP_AMOUNTS } from '../gifting/tip-service.js';
import type { VirtualGood } from '../types.js';

describe('Gifting & Tipping', () => {
  let wallet: CoinWallet;
  let catalog: VirtualGoodsCatalog;
  let inventory: CrossAppInventory;

  const giftItem: VirtualGood = {
    id: 'gift-rose',
    name: 'Virtual Rose',
    description: 'A virtual rose gift',
    category: 'gift_item',
    priceCoins: 25,
    crossApp: true,
  };

  beforeEach(() => {
    wallet = new CoinWallet();
    wallet.createWallet('sender');
    wallet.createWallet('recipient');
    wallet.creditCoins('sender', 500, 'seed');
    catalog = new VirtualGoodsCatalog();
    catalog.addItem(giftItem);
    inventory = new CrossAppInventory();
  });

  describe('GiftingService', () => {
    let giftingService: GiftingService;

    beforeEach(() => {
      giftingService = new GiftingService(wallet, catalog, inventory);
    });

    it('should deduct coins from sender when sending a gift', () => {
      const result = giftingService.sendGift('sender', 'recipient', 'gift-rose');
      expect(result.success).toBe(true);
      expect(wallet.getBalance('sender')).toBe(475); // 500 - 25
    });

    it('should grant item to recipient inventory', () => {
      giftingService.sendGift('sender', 'recipient', 'gift-rose');
      expect(inventory.hasItem('recipient', 'gift-rose')).toBe(true);
    });

    it('should reject gift if sender has insufficient coins', () => {
      wallet.debitCoins('sender', 490, 'drain'); // leaves 10
      const result = giftingService.sendGift('sender', 'recipient', 'gift-rose');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient balance');
    });

    it('should track sent and received gifts', () => {
      giftingService.sendGift('sender', 'recipient', 'gift-rose');
      expect(giftingService.getSentGifts('sender')).toHaveLength(1);
      expect(giftingService.getReceivedGifts('recipient')).toHaveLength(1);
    });
  });

  describe('TippingService', () => {
    let tippingService: TippingService;

    beforeEach(() => {
      tippingService = new TippingService(wallet);
    });

    it('should deduct coins from sender and credit recipient', () => {
      const result = tippingService.sendTip('sender', 'recipient', 50);
      expect(result.success).toBe(true);
      expect(wallet.getBalance('sender')).toBe(450);
      expect(wallet.getBalance('recipient')).toBe(50);
    });

    it('should track tips sent and received', () => {
      tippingService.sendTip('sender', 'recipient', 100);
      expect(tippingService.getTipsSent('sender')).toHaveLength(1);
      expect(tippingService.getTipsReceived('recipient')).toHaveLength(1);
    });

    it('should have preset tip amounts (10, 50, 100, 500)', () => {
      const presets = tippingService.getPresetAmounts();
      expect(presets).toEqual([10, 50, 100, 500]);
    });

    it('should export PRESET_TIP_AMOUNTS constant', () => {
      expect(PRESET_TIP_AMOUNTS).toEqual([10, 50, 100, 500]);
    });
  });
});
