import type { InventoryItem } from '../types.js';

export class CrossAppInventory {
  private inventory = new Map<string, Set<string>>(); // userId -> Set<itemId>
  private items: InventoryItem[] = [];

  grantItem(userId: string, itemId: string): InventoryItem {
    let userItems = this.inventory.get(userId);
    if (!userItems) {
      userItems = new Set<string>();
      this.inventory.set(userId, userItems);
    }
    userItems.add(itemId);

    const item: InventoryItem = {
      userId,
      itemId,
      grantedAt: new Date(),
    };
    this.items.push(item);
    return item;
  }

  revokeItem(userId: string, itemId: string): boolean {
    const userItems = this.inventory.get(userId);
    if (!userItems) return false;
    return userItems.delete(itemId);
  }

  getUserItems(userId: string): string[] {
    const userItems = this.inventory.get(userId);
    return userItems ? [...userItems] : [];
  }

  hasItem(userId: string, itemId: string): boolean {
    const userItems = this.inventory.get(userId);
    return userItems?.has(itemId) ?? false;
  }
}
