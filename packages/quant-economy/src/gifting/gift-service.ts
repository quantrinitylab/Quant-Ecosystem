import type { Gift } from '../types.js';
import type { CoinWallet } from '../coins/wallet.js';
import type { VirtualGoodsCatalog } from '../store/catalog.js';
import type { CrossAppInventory } from '../store/inventory.js';

export class GiftingService {
  private gifts: Gift[] = [];
  private wallet: CoinWallet;
  private catalog: VirtualGoodsCatalog;
  private inventory: CrossAppInventory;

  constructor(wallet: CoinWallet, catalog: VirtualGoodsCatalog, inventory: CrossAppInventory) {
    this.wallet = wallet;
    this.catalog = catalog;
    this.inventory = inventory;
  }

  sendGift(
    fromUserId: string,
    toUserId: string,
    itemId: string,
  ): { success: boolean; gift?: Gift; message?: string } {
    const item = this.catalog.getItem(itemId);
    if (!item) {
      return { success: false, message: 'Item not found' };
    }

    try {
      this.wallet.debitCoins(fromUserId, item.priceCoins, `gift:${itemId}:to:${toUserId}`);
    } catch (e: any) {
      return { success: false, message: e.message };
    }

    const gift: Gift = {
      id: crypto.randomUUID(),
      fromUserId,
      toUserId,
      itemId,
      status: 'pending',
      createdAt: new Date(),
    };
    this.gifts.push(gift);

    // Auto-grant to recipient inventory
    this.inventory.grantItem(toUserId, itemId);
    gift.status = 'accepted';

    return { success: true, gift };
  }

  getReceivedGifts(userId: string): Gift[] {
    return this.gifts.filter((g) => g.toUserId === userId);
  }

  getSentGifts(userId: string): Gift[] {
    return this.gifts.filter((g) => g.fromUserId === userId);
  }
}
