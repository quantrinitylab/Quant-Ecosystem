import type {
  AppContext,
  GamingActivity,
  IdentityBridgeServiceConfig,
  IdentityMode,
  IdentityRevealConsent,
  PublicAnonymousIdentity,
} from '../types.js';

interface InternalAnonymousIdentity {
  anonymousId: string;
  realUserId: string;
  displayName: string;
  createdAt: Date;
}

interface CrossAppLink {
  userId: string;
  sessionId: string;
  appContext: AppContext;
  linkedAt: Date;
}

export class IdentityBridgeService {
  private anonymousIdentities = new Map<string, InternalAnonymousIdentity>();
  private consents = new Map<string, IdentityRevealConsent>();
  private crossAppLinks: CrossAppLink[] = [];
  private activityLog: GamingActivity[] = [];
  private config: IdentityBridgeServiceConfig;

  constructor(config: IdentityBridgeServiceConfig) {
    this.config = config;
  }

  createAnonymousIdentity(userId: string): PublicAnonymousIdentity {
    const existing = this.anonymousIdentities.get(userId);
    if (existing) {
      return {
        anonymousId: existing.anonymousId,
        displayName: existing.displayName,
        createdAt: existing.createdAt,
      };
    }

    const identity: InternalAnonymousIdentity = {
      anonymousId: `anon_${Math.random().toString(36).slice(2, 10)}`,
      realUserId: userId,
      displayName: `Player_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      createdAt: new Date(),
    };

    this.anonymousIdentities.set(userId, identity);
    return {
      anonymousId: identity.anonymousId,
      displayName: identity.displayName,
      createdAt: identity.createdAt,
    };
  }

  revealIdentity(fromUserId: string, toUserId: string, consent: boolean): IdentityRevealConsent {
    const consentKey = `${fromUserId}:${toUserId}`;

    if (!consent) {
      throw new Error('Identity reveal requires explicit consent');
    }

    const consentRecord: IdentityRevealConsent = {
      fromUserId,
      toUserId,
      consentedAt: new Date(),
      revoked: false,
    };

    this.consents.set(consentKey, consentRecord);
    return consentRecord;
  }

  revokeConsent(fromUserId: string, toUserId: string): void {
    const consentKey = `${fromUserId}:${toUserId}`;
    const consent = this.consents.get(consentKey);
    if (!consent) {
      throw new Error('No consent record found to revoke');
    }
    consent.revoked = true;
  }

  getDisplayIdentity(
    userId: string,
    viewerUserId: string,
    context: AppContext,
  ): { displayName: string; identityMode: IdentityMode } {
    // In random_match context, always anonymous unless consent given
    if (context === 'random_match') {
      const consentKey = `${userId}:${viewerUserId}`;
      const reverseKey = `${viewerUserId}:${userId}`;
      const hasConsent = this.consents.get(consentKey);
      const hasReverseConsent = this.consents.get(reverseKey);

      if (hasConsent && hasReverseConsent && !hasConsent.revoked && !hasReverseConsent.revoked) {
        return { displayName: userId, identityMode: 'revealed' };
      }

      const anonIdentity = this.anonymousIdentities.get(userId);
      if (anonIdentity) {
        return { displayName: anonIdentity.displayName, identityMode: 'anonymous' };
      }

      return { displayName: 'Anonymous', identityMode: 'anonymous' };
    }

    // In other contexts, use the configured default
    return { displayName: userId, identityMode: this.config.defaultIdentityMode };
  }

  linkCrossAppSession(userId: string, sessionId: string, appContext: AppContext): void {
    this.crossAppLinks.push({
      userId,
      sessionId,
      appContext,
      linkedAt: new Date(),
    });

    this.activityLog.push({
      gameId: sessionId,
      sessionId,
      startedAt: new Date(),
      duration: 0,
      appContext,
    });
  }

  getPlayerHistory(userId: string): GamingActivity[] {
    return this.crossAppLinks
      .filter((link) => link.userId === userId)
      .map((link) => ({
        gameId: link.sessionId,
        sessionId: link.sessionId,
        startedAt: link.linkedAt,
        duration: 0,
        appContext: link.appContext,
      }));
  }

  hasMutualConsent(userA: string, userB: string): boolean {
    const consentAB = this.consents.get(`${userA}:${userB}`);
    const consentBA = this.consents.get(`${userB}:${userA}`);
    return !!(consentAB && consentBA && !consentAB.revoked && !consentBA.revoked);
  }
}
