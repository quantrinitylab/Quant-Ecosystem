import type {
  AgeGroup,
  CommunicationLimits,
  GameContentRating,
  GameRegistryEntry,
  GamingActivity,
  MinorSafetyServiceConfig,
} from '../types.js';

interface ContentFlag {
  sessionId: string;
  reporterId: string;
  contentType: string;
  flaggedAt: Date;
}

/** Maps age groups to the maximum content rating they can access */
const AGE_GROUP_MAX_RATING: Record<AgeGroup, GameContentRating> = {
  under13: 'everyone',
  teen: 'teen',
  adult: 'mature',
};

const RATING_LEVELS: Record<GameContentRating, number> = {
  everyone: 0,
  teen: 1,
  mature: 2,
};

export class MinorSafetyService {
  private config: MinorSafetyServiceConfig;
  private activityLog = new Map<string, GamingActivity[]>();
  private contentFlags: ContentFlag[] = [];
  private gameRegistry = new Map<string, GameRegistryEntry>();

  constructor(config: MinorSafetyServiceConfig) {
    this.config = config;
  }

  registerGame(entry: GameRegistryEntry): void {
    this.gameRegistry.set(entry.gameId, entry);
  }

  checkGameAccess(_playerId: string, gameId: string, ageGroup: AgeGroup): boolean {
    if (!this.config.safetyConfigs[ageGroup]) {
      return true;
    }

    const game = this.gameRegistry.get(gameId);
    if (!game) {
      // Unknown game defaults to allowed (no rating info available)
      return true;
    }

    const maxAllowed = AGE_GROUP_MAX_RATING[ageGroup];
    const gameLevel = RATING_LEVELS[game.contentRating];
    const allowedLevel = RATING_LEVELS[maxAllowed];

    return gameLevel <= allowedLevel;
  }

  getCommunicationLimits(ageGroup: AgeGroup): CommunicationLimits {
    if (ageGroup === 'under13') {
      return {
        voiceChat: false,
        videoChat: false,
        textChat: true,
        textFiltering: true,
        canChatWithStrangers: false,
      };
    }

    if (ageGroup === 'teen') {
      return {
        voiceChat: true,
        videoChat: false,
        textChat: true,
        textFiltering: true,
        canChatWithStrangers: true,
      };
    }

    // Adult
    return {
      voiceChat: true,
      videoChat: true,
      textChat: true,
      textFiltering: false,
      canChatWithStrangers: true,
    };
  }

  validatePurchase(_playerId: string, ageGroup: AgeGroup, _amount: number): boolean {
    const safetyConfig = this.config.safetyConfigs[ageGroup];

    if (!safetyConfig) {
      return true;
    }

    if (safetyConfig.blockRealMoney) {
      throw new Error('Real-money purchases are blocked for this age group');
    }

    return true;
  }

  getParentalVisibility(_parentId: string, childId: string): GamingActivity[] {
    return this.activityLog.get(childId) ?? [];
  }

  recordActivity(childId: string, activity: GamingActivity): void {
    const activities = this.activityLog.get(childId) ?? [];
    activities.push(activity);
    this.activityLog.set(childId, activities);
  }

  flagInappropriateContent(sessionId: string, reporterId: string, contentType: string): void {
    this.contentFlags.push({
      sessionId,
      reporterId,
      contentType,
      flaggedAt: new Date(),
    });
  }

  getContentFlags(sessionId?: string): ContentFlag[] {
    if (sessionId) {
      return this.contentFlags.filter((f) => f.sessionId === sessionId);
    }
    return [...this.contentFlags];
  }
}
