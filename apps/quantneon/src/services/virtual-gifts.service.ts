export interface VirtualGift {
  id: string;
  name: string;
  icon: string;
  coinCost: number;
  animationType: 'pulse' | 'float' | 'burst' | 'fullscreen';
}

export interface GiftTransaction {
  id: string;
  senderId: string;
  creatorId: string;
  gift: VirtualGift;
  coinsSpent: number;
  diamondsEarned: number;
  contextId?: string; // reelId or streamId
  createdAt: string;
}

export interface UserWallet {
  userId: string;
  coinBalance: number;
  diamondsBalance: number;
  totalEarnedDiamonds: number;
}

export const DEFAULT_GIFTS: VirtualGift[] = [
  { id: 'gift_rose', name: 'Rose', icon: '🌹', coinCost: 1, animationType: 'pulse' },
  { id: 'gift_heart', name: 'Heart', icon: '💖', coinCost: 5, animationType: 'float' },
  { id: 'gift_coffee', name: 'Coffee', icon: '☕', coinCost: 10, animationType: 'float' },
  { id: 'gift_diamond', name: 'Diamond Ring', icon: '💎', coinCost: 50, animationType: 'burst' },
  { id: 'gift_rocket', name: 'Rocket', icon: '🚀', coinCost: 100, animationType: 'fullscreen' },
  { id: 'gift_car', name: 'Sports Car', icon: '🏎️', coinCost: 500, animationType: 'fullscreen' },
];

export const CREATOR_SHARE_PERCENTAGE = 0.8; // 80% to creator
export const DIAMOND_TO_USD_RATE = 0.01; // 1 diamond = $0.01

// In-memory stores for wallets and transactions
const wallets = new Map<string, UserWallet>();
const transactions: GiftTransaction[] = [];

export function getVirtualGiftsCatalogue(): VirtualGift[] {
  return DEFAULT_GIFTS;
}

export function getUserWallet(userId: string): UserWallet {
  let wallet = wallets.get(userId);
  if (!wallet) {
    wallet = {
      userId,
      coinBalance: 0,
      diamondsBalance: 0,
      totalEarnedDiamonds: 0,
    };
    wallets.set(userId, wallet);
  }
  return { ...wallet };
}

export function depositCoins(userId: string, coinAmount: number): UserWallet {
  if (coinAmount < 0) {
    throw new Error('Coin deposit amount cannot be negative');
  }
  let wallet = wallets.get(userId);
  if (!wallet) {
    wallet = {
      userId,
      coinBalance: 0,
      diamondsBalance: 0,
      totalEarnedDiamonds: 0,
    };
    wallets.set(userId, wallet);
  }
  wallet.coinBalance += coinAmount;
  return { ...wallet };
}

export function sendVirtualGift(
  senderId: string,
  creatorId: string,
  giftId: string,
  contextId?: string,
): GiftTransaction {
  const gift = DEFAULT_GIFTS.find((g) => g.id === giftId);
  if (!gift) {
    throw new Error(`Gift with id ${giftId} not found`);
  }

  const senderWallet = getUserWallet(senderId);
  if (senderWallet.coinBalance < gift.coinCost) {
    throw new Error('INSUFFICIENT_COINS');
  }

  // Deduct from sender
  const updatedSender = wallets.get(senderId)!;
  updatedSender.coinBalance -= gift.coinCost;

  // Calculate creator diamonds (80%)
  const diamondsEarned = Math.floor(gift.coinCost * CREATOR_SHARE_PERCENTAGE);

  // Credit creator
  let creatorWallet = wallets.get(creatorId);
  if (!creatorWallet) {
    creatorWallet = {
      userId: creatorId,
      coinBalance: 0,
      diamondsBalance: 0,
      totalEarnedDiamonds: 0,
    };
    wallets.set(creatorId, creatorWallet);
  }
  creatorWallet.diamondsBalance += diamondsEarned;
  creatorWallet.totalEarnedDiamonds += diamondsEarned;

  const transaction: GiftTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    senderId,
    creatorId,
    gift,
    coinsSpent: gift.coinCost,
    diamondsEarned,
    contextId,
    createdAt: new Date().toISOString(),
  };

  transactions.push(transaction);
  return transaction;
}

export function calculateCreatorPayout(creatorId: string): {
  diamonds: number;
  estimatedUsd: number;
  eligibleForPayout: boolean;
} {
  const wallet = getUserWallet(creatorId);
  const diamonds = wallet.diamondsBalance;
  const estimatedUsd = Number((diamonds * DIAMOND_TO_USD_RATE).toFixed(2));
  const eligibleForPayout = diamonds >= 100;

  return {
    diamonds,
    estimatedUsd,
    eligibleForPayout,
  };
}

export function deductCreatorDiamonds(creatorId: string, diamonds: number): void {
  if (diamonds <= 0) {
    throw new Error('Diamonds amount must be positive');
  }
  const wallet = wallets.get(creatorId);
  if (!wallet || wallet.diamondsBalance < diamonds) {
    throw new Error('INSUFFICIENT_DIAMONDS');
  }
  wallet.diamondsBalance -= diamonds;
}

export function creditCreatorDiamonds(
  creatorId: string,
  diamonds: number,
  isNewEarning: boolean = false,
): void {
  if (diamonds <= 0) {
    throw new Error('Diamonds amount must be positive');
  }
  let wallet = wallets.get(creatorId);
  if (!wallet) {
    wallet = {
      userId: creatorId,
      coinBalance: 0,
      diamondsBalance: 0,
      totalEarnedDiamonds: 0,
    };
    wallets.set(creatorId, wallet);
  }
  wallet.diamondsBalance += diamonds;
  if (isNewEarning) {
    wallet.totalEarnedDiamonds += diamonds;
  }
}

export function clearWalletsForTesting(): void {
  wallets.clear();
  transactions.length = 0;
}
