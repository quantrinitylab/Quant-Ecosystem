// ============================================================================
// Lamat v3.2.0-Grade Interactive Crush/Nope Card Deck & Diamond Tip Gifting Ledger
// ============================================================================

export type DeckAction = 'CRUSH' | 'LIKE' | 'NOPE';

export interface SwipeCardInteraction {
  id: string;
  actorUserId: string;
  targetUserId: string;
  action: DeckAction;
  timestamp: string;
  isUndone: boolean;
}

export interface DiamondTipTransaction {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  diamondAmount: number;
  creatorNetDiamonds: number;
  platformFeeDiamonds: number;
  postOrProfileId?: string;
  note?: string;
  createdAt: string;
}

export interface UserKarmaProfile {
  userId: string;
  karmaScore: number; // default 100
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  isRestricted: boolean;
  flagCount: number;
  undoTokensCount: number; // default 3
}

export class LamatCardDeckService {
  private static interactions: SwipeCardInteraction[] = [];
  private static userKarmaProfiles: Map<string, UserKarmaProfile> = new Map();
  private static tipTransactions: DiamondTipTransaction[] = [];

  static clearDeckForTesting(): void {
    LamatCardDeckService.interactions = [];
    LamatCardDeckService.userKarmaProfiles.clear();
    LamatCardDeckService.tipTransactions = [];
  }

  static getUserKarma(userId: string): UserKarmaProfile {
    let profile = LamatCardDeckService.userKarmaProfiles.get(userId);
    if (!profile) {
      profile = {
        userId,
        karmaScore: 100,
        tier: 'SILVER',
        isRestricted: false,
        flagCount: 0,
        undoTokensCount: 3,
      };
      LamatCardDeckService.userKarmaProfiles.set(userId, profile);
    }
    return profile;
  }

  static recordDeckSwipe(
    actorUserId: string,
    targetUserId: string,
    action: DeckAction,
  ): SwipeCardInteraction {
    // Ensure karma profile is initialized
    LamatCardDeckService.getUserKarma(actorUserId);

    const interaction: SwipeCardInteraction = {
      id: `swipe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUserId,
      targetUserId,
      action,
      timestamp: new Date().toISOString(),
      isUndone: false,
    };

    LamatCardDeckService.interactions.push(interaction);
    return interaction;
  }

  static undoLastSwipe(actorUserId: string): {
    success: boolean;
    undoneInteraction?: SwipeCardInteraction;
    error?: string;
  } {
    const profile = LamatCardDeckService.getUserKarma(actorUserId);

    if (profile.undoTokensCount <= 0) {
      throw new Error('NO_UNDO_TOKENS');
    }

    // Find the most recent active swipe by this actor
    const actorSwipes = LamatCardDeckService.interactions.filter(
      (item) => item.actorUserId === actorUserId && !item.isUndone,
    );

    if (actorSwipes.length === 0) {
      return {
        success: false,
        error: 'NO_SWIPES_TO_UNDO',
      };
    }

    const lastSwipe = actorSwipes[actorSwipes.length - 1];
    profile.undoTokensCount -= 1;
    lastSwipe.isUndone = true;

    return {
      success: true,
      undoneInteraction: lastSwipe,
    };
  }

  static sendDiamondTip(
    senderUserId: string,
    recipientUserId: string,
    diamonds: number,
    senderBalance: number,
    targetId?: string,
    note?: string,
  ): { transaction: DiamondTipTransaction; remainingBalance: number } {
    if (diamonds <= 0) {
      throw new Error('INVALID_DIAMOND_AMOUNT: Diamonds must be greater than 0');
    }

    if (senderBalance < diamonds) {
      throw new Error('INSUFFICIENT_DIAMOND_BALANCE: Insufficient diamond balance');
    }

    const platformFeeDiamonds = Math.floor(diamonds * 0.05);
    const creatorNetDiamonds = diamonds - platformFeeDiamonds;
    const remainingBalance = senderBalance - diamonds;

    const transaction: DiamondTipTransaction = {
      id: `tip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderUserId,
      recipientUserId,
      diamondAmount: diamonds,
      creatorNetDiamonds,
      platformFeeDiamonds,
      postOrProfileId: targetId,
      note,
      createdAt: new Date().toISOString(),
    };

    LamatCardDeckService.tipTransactions.push(transaction);

    return {
      transaction,
      remainingBalance,
    };
  }

  static updateKarmaScore(
    userId: string,
    karmaDelta: number,
    flagReason?: string,
  ): UserKarmaProfile {
    const profile = LamatCardDeckService.getUserKarma(userId);

    profile.karmaScore += karmaDelta;

    if (flagReason) {
      profile.flagCount += 1;
    }

    // Auto-moderation check: If flags >= 3 or karma < 20, sets isRestricted = true
    if (profile.flagCount >= 3 || profile.karmaScore < 20) {
      profile.isRestricted = true;
    } else {
      profile.isRestricted = false;
    }

    // Tier evaluation: < 100: BRONZE, 100..499: SILVER, 500..999: GOLD, >= 1000: PLATINUM
    if (profile.karmaScore < 100) {
      profile.tier = 'BRONZE';
    } else if (profile.karmaScore < 500) {
      profile.tier = 'SILVER';
    } else if (profile.karmaScore < 1000) {
      profile.tier = 'GOLD';
    } else {
      profile.tier = 'PLATINUM';
    }

    return profile;
  }

  static getUserInteractions(userId: string): SwipeCardInteraction[] {
    return LamatCardDeckService.interactions.filter((item) => item.actorUserId === userId);
  }

  static getTipTransactions(): DiamondTipTransaction[] {
    return [...LamatCardDeckService.tipTransactions];
  }
}

// Standalone function exports
export const recordDeckSwipe = LamatCardDeckService.recordDeckSwipe;
export const undoLastSwipe = LamatCardDeckService.undoLastSwipe;
export const sendDiamondTip = LamatCardDeckService.sendDiamondTip;
export const updateKarmaScore = LamatCardDeckService.updateKarmaScore;
export const getUserKarma = LamatCardDeckService.getUserKarma;
export const clearDeckForTesting = LamatCardDeckService.clearDeckForTesting;
export const getUserInteractions = LamatCardDeckService.getUserInteractions;
export const getTipTransactions = LamatCardDeckService.getTipTransactions;
