// ============================================================================
// QuantWave / Flirtzy Dating Matchmaking & Elo Radar Scoring Engine
// ============================================================================

import { createAppError } from '@quant/server-core';

export type SwipeAction = 'LIKE' | 'PASS' | 'SUPER_LIKE';
export type VerificationStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export type PoseChallenge = 'look_left' | 'smile' | 'tilt_head';

export interface UserMatchProfile {
  userId: string;
  displayName: string;
  age: number;
  gender: 'male' | 'female' | 'non_binary';
  lookingFor: Array<'male' | 'female' | 'non_binary'>;
  location: { lat: number; lng: number };
  eloRating: number; // default 1200
  bio: string;
  interests: string[];
  verificationStatus: VerificationStatus;
}

export interface MatchRecord {
  id: string;
  user1Id: string;
  user2Id: string;
  matchedAt: string;
  icebreakerQuestion: string;
  isSuperMatch: boolean;
}

export interface SwipeResult {
  action: SwipeAction;
  isMutualMatch: boolean;
  matchRecord?: MatchRecord;
}

export const CURATED_ICEBREAKERS: string[] = [
  'If you could teleport anywhere right now for dinner, where are we going?',
  'What is your all-time favorite travel destination?',
  'Coffee date or rooftop drinks for the first meetup?',
  "What's an unusual skill or hidden talent you have?",
  'What song immediately puts you in a great mood?',
  'If we went to karaoke, what song are you picking?',
  'What is your favorite weekend morning ritual?',
  'Early bird catches the sunrise or night owl under the stars?',
  "What's the best concert or live show you've ever been to?",
  "What's your go-to comfort food after a long day?",
];

export function generateIcebreaker(user1?: UserMatchProfile, user2?: UserMatchProfile): string {
  if (user1?.interests && user2?.interests) {
    const shared = user1.interests.filter((i) =>
      user2.interests.some((j) => j.toLowerCase().trim() === i.toLowerCase().trim()),
    );
    if (shared.length > 0) {
      const topic = shared[0].toLowerCase().trim();
      if (topic.includes('travel')) {
        return "You both love travel! What's the next destination on your bucket list?";
      }
      if (topic.includes('music')) {
        return 'You both love music! Who is your top artist or favorite track right now?';
      }
      if (topic.includes('food') || topic.includes('cooking')) {
        return "You both love food! What's your absolute favorite signature dish or restaurant?";
      }
      if (topic.includes('tech') || topic.includes('code')) {
        return "You both love tech! What's the coolest project or gadget you've seen recently?";
      }
      if (topic.includes('fitness') || topic.includes('gym')) {
        return 'You both love fitness! Morning workout grind or evening sessions?';
      }
      if (topic.includes('movie') || topic.includes('cinema')) {
        return "You both love movies! What's a film you can watch over and over without getting bored?";
      }
      return `You both love ${shared[0]}! What got you interested in it?`;
    }
  }

  const index = Math.floor(Math.random() * CURATED_ICEBREAKERS.length);
  return CURATED_ICEBREAKERS[index] ?? 'Coffee date or rooftop drinks for the first meetup?';
}

export class MatchmakingService {
  private static profiles: Map<string, UserMatchProfile> = new Map();
  private static swipes: Map<string, SwipeAction> = new Map(); // `${actorId}:${targetId}` -> action
  private static matches: Map<string, MatchRecord> = new Map();
  private static challenges: Map<string, PoseChallenge> = new Map();

  static clearMatchmakingForTesting(): void {
    MatchmakingService.profiles.clear();
    MatchmakingService.swipes.clear();
    MatchmakingService.matches.clear();
    MatchmakingService.challenges.clear();
  }

  static registerUserProfile(
    profile: Partial<UserMatchProfile> & {
      userId: string;
      displayName: string;
      age: number;
      gender: 'male' | 'female' | 'non_binary';
      location: { lat: number; lng: number };
    },
  ): UserMatchProfile {
    const elo = profile.eloRating ?? (profile as any).elo ?? 1200;
    const fullProfile: UserMatchProfile = {
      userId: profile.userId,
      displayName: profile.displayName,
      age: profile.age,
      gender: profile.gender,
      lookingFor: profile.lookingFor ?? [],
      location: { ...profile.location },
      eloRating: elo,
      bio: profile.bio ?? '',
      interests: profile.interests ?? [],
      verificationStatus: profile.verificationStatus ?? 'UNVERIFIED',
    };

    // Provide .elo alias for formula compatibility
    Object.defineProperty(fullProfile, 'elo', {
      get() {
        return this.eloRating;
      },
      set(val: number) {
        this.eloRating = val;
      },
      enumerable: true,
      configurable: true,
    });

    MatchmakingService.profiles.set(profile.userId, fullProfile);
    return fullProfile;
  }

  static getUserProfile(userId: string): UserMatchProfile | undefined {
    return MatchmakingService.profiles.get(userId);
  }

  static calculateHaversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth mean radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  static getRecommendedMatches(userId: string, maxDistanceKm: number = 50): UserMatchProfile[] {
    const user = MatchmakingService.profiles.get(userId);
    if (!user) return [];

    const candidates: UserMatchProfile[] = [];

    for (const candidate of MatchmakingService.profiles.values()) {
      if (candidate.userId === userId) continue;

      // Mutual gender preference filter
      const userWantsCandidate = user.lookingFor.includes(candidate.gender);
      const candidateWantsUser = candidate.lookingFor.includes(user.gender);
      if (!userWantsCandidate || !candidateWantsUser) continue;

      // Distance filter
      const distance = MatchmakingService.calculateHaversineDistanceKm(
        user.location.lat,
        user.location.lng,
        candidate.location.lat,
        candidate.location.lng,
      );
      if (distance > maxDistanceKm) continue;

      candidates.push(candidate);
    }

    // Sort by Elo proximity (Math.abs(user.elo - candidate.elo)) ascending
    const userElo = user.eloRating ?? (user as any).elo ?? 1200;
    candidates.sort((a, b) => {
      const eloA = a.eloRating ?? (a as any).elo ?? 1200;
      const eloB = b.eloRating ?? (b as any).elo ?? 1200;
      const diffA = Math.abs(userElo - eloA);
      const diffB = Math.abs(userElo - eloB);
      if (diffA !== diffB) {
        return diffA - diffB;
      }
      // Secondary sort: distance
      const distA = MatchmakingService.calculateHaversineDistanceKm(
        user.location.lat,
        user.location.lng,
        a.location.lat,
        a.location.lng,
      );
      const distB = MatchmakingService.calculateHaversineDistanceKm(
        user.location.lat,
        user.location.lng,
        b.location.lat,
        b.location.lng,
      );
      return distA - distB;
    });

    return candidates;
  }

  static recordSwipe(actorUserId: string, targetUserId: string, action: SwipeAction): SwipeResult {
    if (actorUserId === targetUserId) {
      throw createAppError('Cannot swipe on yourself', 400, 'SELF_SWIPE');
    }

    const swipeKey = `${actorUserId}:${targetUserId}`;
    MatchmakingService.swipes.set(swipeKey, action);

    const actor = MatchmakingService.profiles.get(actorUserId);
    const target = MatchmakingService.profiles.get(targetUserId);

    // Update Elo rating: Winning like increases rating slightly
    if (target) {
      if (action === 'LIKE') {
        target.eloRating = (target.eloRating ?? 1200) + 10;
      } else if (action === 'SUPER_LIKE') {
        target.eloRating = (target.eloRating ?? 1200) + 20;
      } else if (action === 'PASS') {
        target.eloRating = Math.max(100, (target.eloRating ?? 1200) - 2);
      }
    }

    // Check for mutual match
    if (action === 'LIKE' || action === 'SUPER_LIKE') {
      const reverseKey = `${targetUserId}:${actorUserId}`;
      const reverseAction = MatchmakingService.swipes.get(reverseKey);

      if (reverseAction === 'LIKE' || reverseAction === 'SUPER_LIKE') {
        // Mutual like updates both users' Elo
        if (actor) {
          actor.eloRating = (actor.eloRating ?? 1200) + 15;
        }
        if (target) {
          target.eloRating = (target.eloRating ?? 1200) + 15;
        }

        const isSuperMatch = action === 'SUPER_LIKE' || reverseAction === 'SUPER_LIKE';
        const icebreakerQuestion = generateIcebreaker(actor, target);

        const matchRecord: MatchRecord = {
          id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          user1Id: actorUserId,
          user2Id: targetUserId,
          matchedAt: new Date().toISOString(),
          icebreakerQuestion,
          isSuperMatch,
        };

        MatchmakingService.matches.set(matchRecord.id, matchRecord);

        return {
          action,
          isMutualMatch: true,
          matchRecord,
        };
      }
    }

    return {
      action,
      isMutualMatch: false,
    };
  }

  static setVerificationChallenge(userId: string, challenge: PoseChallenge): void {
    MatchmakingService.challenges.set(userId, challenge);
  }

  static getVerificationChallenge(userId: string): PoseChallenge {
    return MatchmakingService.challenges.get(userId) ?? 'smile';
  }

  static submitSelfieVerification(
    userId: string,
    selfieUrl: string,
    detectedPose: 'look_left' | 'smile' | 'tilt_head',
    expectedPose?: 'look_left' | 'smile' | 'tilt_head',
  ): { status: VerificationStatus; verifiedAt?: string } {
    const challenge = expectedPose ?? MatchmakingService.challenges.get(userId) ?? 'smile';

    const user = MatchmakingService.profiles.get(userId);

    if (detectedPose === challenge) {
      const verifiedAt = new Date().toISOString();
      if (user) {
        user.verificationStatus = 'VERIFIED';
      }
      return {
        status: 'VERIFIED',
        verifiedAt,
      };
    } else {
      if (user) {
        user.verificationStatus = 'REJECTED';
      }
      return {
        status: 'REJECTED',
      };
    }
  }

  static getMatch(matchId: string): MatchRecord | undefined {
    return MatchmakingService.matches.get(matchId);
  }

  static getUserMatches(userId: string): MatchRecord[] {
    const results: MatchRecord[] = [];
    for (const match of MatchmakingService.matches.values()) {
      if (match.user1Id === userId || match.user2Id === userId) {
        results.push(match);
      }
    }
    return results;
  }
}

// Standalone functions for direct import compatibility
export function registerUserProfile(profile: UserMatchProfile): UserMatchProfile {
  return MatchmakingService.registerUserProfile(profile);
}

export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return MatchmakingService.calculateHaversineDistanceKm(lat1, lon1, lat2, lon2);
}

export function getRecommendedMatches(userId: string, maxDistanceKm?: number): UserMatchProfile[] {
  return MatchmakingService.getRecommendedMatches(userId, maxDistanceKm);
}

export function recordSwipe(
  actorUserId: string,
  targetUserId: string,
  action: SwipeAction,
): SwipeResult {
  return MatchmakingService.recordSwipe(actorUserId, targetUserId, action);
}

export function submitSelfieVerification(
  userId: string,
  selfieUrl: string,
  detectedPose: 'look_left' | 'smile' | 'tilt_head',
  expectedPose?: 'look_left' | 'smile' | 'tilt_head',
): { status: VerificationStatus; verifiedAt?: string } {
  return MatchmakingService.submitSelfieVerification(userId, selfieUrl, detectedPose, expectedPose);
}

export function setVerificationChallenge(userId: string, challenge: PoseChallenge): void {
  MatchmakingService.setVerificationChallenge(userId, challenge);
}

export function clearMatchmakingForTesting(): void {
  MatchmakingService.clearMatchmakingForTesting();
}
