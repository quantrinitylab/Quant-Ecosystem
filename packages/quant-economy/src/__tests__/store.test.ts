import { describe, it, expect, beforeEach } from 'vitest';
import { CoinWallet } from '../coins/wallet.js';
import { VirtualGoodsCatalog } from '../store/catalog.js';
import { CrossAppInventory } from '../store/inventory.js';
import { StorePurchaseService } from '../store/purchase.js';
import type { VirtualGood } from '../types.js';

describe('Virtual Goods Store', () => {
  let wallet: CoinWallet;
  let catalog: VirtualGoodsCatalog;
  let inventory: CrossAppInventory;
  let purchaseService: StorePurchaseService;

  const sampleItem: VirtualGood = {
    id: 'item-1',
    name: 'Cool Avatar',
    description: 'A cool avatar frame',
    category: 'avatar_item',
    priceCoins: 50,
    crossApp: true,
  };

  beforeEach(() => {
    wallet = new CoinWallet();
    wallet.createWallet('user-1');
    catalog = new VirtualGoodsCatalog();
    inventory = new CrossAppInventory();
    purchaseService = new StorePurchaseService(wallet, catalog, inventory);
  });

  describe('VirtualGoodsCatalog', () => {
    it('should add and retrieve catalog items', () => {
      catalog.addItem(sampleItem);
      const item = catalog.getItem('item-1');
      expect(item).toBeDefined();
      expect(item!.name).toBe('Cool Avatar');
    });

    it('should list items by category', () => {
      catalog.addItem(sampleItem);
      catalog.addItem({ ...sampleItem, id: 'item-2', name: 'Outfit 1', category: 'outfit' });
      const avatarItems = catalog.listByCategory('avatar_item');
      expect(avatarItems).toHaveLength(1);
      expect(avatarItems[0]?.id).toBe('item-1');
    });

    it('should search items by name', () => {
      catalog.addItem(sampleItem);
      const results = catalog.search('cool');
      expect(results).toHaveLength(1);
    });
  });

  describe('StorePurchaseService', () => {
    it('should purchase an item with sufficient coins', () => {
      catalog.addItem(sampleItem);
      wallet.creditCoins('user-1', 100, 'seed');
      const result = purchaseService.purchaseItem('user-1', 'item-1');
      expect(result.success).toBe(true);
      expect(wallet.getBalance('user-1')).toBe(50);
      expect(inventory.hasItem('user-1', 'item-1')).toBe(true);
    });

    it('should reject purchase with insufficient coins', () => {
      catalog.addItem(sampleItem);
      wallet.creditCoins('user-1', 10, 'seed');
      const result = purchaseService.purchaseItem('user-1', 'item-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient balance');
    });

    it('should reject purchase for non-existent item', () => {
      const result = purchaseService.purchaseItem('user-1', 'fake-item');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Item not found');
    });
  });

  describe('CrossAppInventory', () => {
    it('should grant and check items', () => {
      inventory.grantItem('user-1', 'item-1');
      expect(inventory.hasItem('user-1', 'item-1')).toBe(true);
    });

    it('should revoke items', () => {
      inventory.grantItem('user-1', 'item-1');
      inventory.revokeItem('user-1', 'item-1');
      expect(inventory.hasItem('user-1', 'item-1')).toBe(false);
    });

    it('should list user items', () => {
      inventory.grantItem('user-1', 'item-1');
      inventory.grantItem('user-1', 'item-2');
      const items = inventory.getUserItems('user-1');
      expect(items).toHaveLength(2);
    });
  });
});
