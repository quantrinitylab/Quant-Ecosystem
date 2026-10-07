import type { CoinWallet } from '../coins/wallet.js';
import type { VirtualGoodsCatalog } from './catalog.js';
import type { CrossAppInventory } from './inventory.js';

export class StorePurchaseService {
  private wallet: CoinWallet;
  private catalog: VirtualGoodsCatalog;
  private inventory: CrossAppInventory;

  constructor(wallet: CoinWallet, catalog: VirtualGoodsCatalog, inventory: CrossAppInventory) {
    this.wallet = wallet;
    this.catalog = catalog;
    this.inventory = inventory;
  }

  purchaseItem(userId: string, itemId: string): { success: boolean; message: string } {
    const item = this.catalog.getItem(itemId);
    if (!item) {
      return { success: false, message: 'Item not found' };
    }

    try {
      this.wallet.debitCoins(userId, item.priceCoins, `purchase:${itemId}`);
    } catch (e: any) {
      return { success: false, message: e.message };
    }

    this.inventory.grantItem(userId, itemId);
    return { success: true, message: `Purchased ${item.name}` };
  }
}
