// ============================================================================
// QuantMax - Matching Service
// Elo-style scoring, compatibility algorithm, match management
// ============================================================================

import type { UserProfile, Match, MatchAction, SwipeAction, MatchPreferences, Gender, RelationshipGoal } from '../../src/types';

interface EloUpdate { newRating: number; change: number; }

export class MatchingService {
  private profiles: Map<string, UserProfile> = new Map();
  private swipeHistory: Map<string, SwipeAction[]> = new Map();
  private matches: Map<string, Match> = new Map();
  private K_FACTOR = 32;
  private BASE_ELO = 1000;

  registerProfile(profile: UserProfile): void {
    if (!profile.eloScore) profile.eloScore = this.BASE_ELO;
    this.profiles.set(profile.id, profile);
  }

  processSwipe(userId: string, targetId: string, action: MatchAction): { match: Match | null; eloChange: EloUpdate } {
    const swipeAction: SwipeAction = { userId, targetUserId: targetId, action, timestamp: new Date().toISOString() };
    const history = this.swipeHistory.get(userId) || [];
    history.push(swipeAction);
    this.swipeHistory.set(userId, history);

    // Update Elo scores
    const eloChange = this.updateElo(userId, targetId, action);

    // Check for mutual like
    let match: Match | null = null;
    if (action === 'like' || action === 'superlike') {
      const targetHistory = this.swipeHistory.get(targetId) || [];
      const mutualLike = targetHistory.find(s => s.targetUserId === userId && (s.action === 'like' || s.action === 'superlike'));
      if (mutualLike) {
        match = this.createMatch(userId, targetId, action === 'superlike' ? 'superlike' : 'like');
      }
    }

    return { match, eloChange };
  }

  private updateElo(userId: string, targetId: string, action: MatchAction): EloUpdate {
    const user = this.profiles.get(userId);
    const target = this.profiles.get(targetId);
    if (!user || !target) return { newRating: this.BASE_ELO, change: 0 };

    // When someone likes you, your Elo goes up
    // Pass = target Elo slightly decreases, liker unchanged
    // SuperLike = target gets bigger Elo boost
    const expectedScore = 1 / (1 + Math.pow(10, (user.eloScore - target.eloScore) / 400));

    let actualScore: number;
    switch (action) {
      case 'like': actualScore = 0.7; break;
      case 'superlike': actualScore = 1.0; break;
      case 'pass': actualScore = 0.3; break;
      case 'boost': actualScore = 0.5; break;
      default: actualScore = 0.5;
    }

    const change = Math.round(this.K_FACTOR * (actualScore - expectedScore));
    target.eloScore = Math.max(0, target.eloScore + change);

    return { newRating: target.eloScore, change };
  }

  private createMatch(userId1: string, userId2: string, type: 'like' | 'superlike'): Match {
    const compatibility = this.calculateCompatibility(userId1, userId2);
    const match: Match = {
      id: `match_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      users: [userId1, userId2],
      matchedAt: new Date().toISOString(),
      type,
      compatibility,
      icebreaker: this.generateIcebreaker(userId1, userId2),
      unreadCount: 0,
      isActive: true,
    };
    this.matches.set(match.id, match);
    return match;
  }

  calculateCompatibility(userId1: string, userId2: string): number {
    const user1 = this.profiles.get(userId1);
    const user2 = this.profiles.get(userId2);
    if (!user1 || !user2) return 0;

    let score = 0;
    let maxScore = 0;

    // Interest overlap (40% weight)
    maxScore += 40;
    const sharedInterests = user1.interests.filter(i => user2.interests.includes(i));
    const totalInterests = new Set([...user1.interests, ...user2.interests]).size;
    score += totalInterests > 0 ? (sharedInterests.length / totalInterests) * 40 : 0;

    // Relationship goal alignment (25% weight)
    maxScore += 25;
    if (user1.relationshipGoal === user2.relationshipGoal) score += 25;
    else if (this.isGoalCompatible(user1.relationshipGoal, user2.relationshipGoal)) score += 15;

    // Age proximity (15% weight)
    maxScore += 15;
    const ageDiff = Math.abs(user1.age - user2.age);
    if (ageDiff <= 2) score += 15;
    else if (ageDiff <= 5) score += 10;
    else if (ageDiff <= 10) score += 5;

    // Distance (10% weight)
    maxScore += 10;
    const distance = this.calculateDistance(user1.location.lat, user1.location.lng, user2.location.lat, user2.location.lng);
    if (distance <= 5) score += 10;
    else if (distance <= 15) score += 7;
    else if (distance <= 50) score += 4;

    // Activity level match (10% weight)
    maxScore += 10;
    const eloRatio = Math.min(user1.eloScore, user2.eloScore) / Math.max(user1.eloScore, user2.eloScore);
    score += eloRatio * 10;

    return Math.round((score / maxScore) * 100);
  }

  private isGoalCompatible(goal1: RelationshipGoal, goal2: RelationshipGoal): boolean {
    const compatible: Record<RelationshipGoal, RelationshipGoal[]> = {
      casual: ['casual', 'open'],
      serious: ['serious'],
      friendship: ['friendship', 'networking'],
      networking: ['networking', 'friendship'],
      open: ['open', 'casual', 'serious'],
    };
    return compatible[goal1]?.includes(goal2) || false;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private generateIcebreaker(userId1: string, userId2: string): string {
    const user1 = this.profiles.get(userId1);
    const user2 = this.profiles.get(userId2);
    if (!user1 || !user2) return "Hey! Looks like we matched!";

    const sharedInterests = user1.interests.filter(i => user2.interests.includes(i));
    if (sharedInterests.length > 0) {
      return `You both love ${sharedInterests[0]}! Great conversation starter.`;
    }
    return "You matched! Say hi and see where the conversation goes.";
  }

  getRecommendations(userId: string, limit: number = 20): UserProfile[] {
    const user = this.profiles.get(userId);
    if (!user) return [];

    const swiped = new Set((this.swipeHistory.get(userId) || []).map(s => s.targetUserId));
    const candidates = Array.from(this.profiles.values())
      .filter(p => p.id !== userId && !swiped.has(p.id))
      .filter(p => this.matchesPreferences(user, p));

    // Sort by compatibility score and Elo similarity
    candidates.sort((a, b) => {
      const compA = this.calculateCompatibility(userId, a.id);
      const compB = this.calculateCompatibility(userId, b.id);
      return compB - compA;
    });

    return candidates.slice(0, limit);
  }

  private matchesPreferences(user: UserProfile, candidate: UserProfile): boolean {
    const prefs = user.preferences;
    if (candidate.age < prefs.ageRange.min || candidate.age > prefs.ageRange.max) return false;
    if (prefs.genders.length > 0 && !prefs.genders.includes(candidate.gender)) return false;
    const dist = this.calculateDistance(user.location.lat, user.location.lng, candidate.location.lat, candidate.location.lng);
    if (dist > prefs.distance) return false;
    return true;
  }

  getMatches(userId: string): Match[] {
    return Array.from(this.matches.values())
      .filter(m => m.users.includes(userId) && m.isActive)
      .sort((a, b) => b.matchedAt.localeCompare(a.matchedAt));
  }

  getMatch(matchId: string): Match | null {
    return this.matches.get(matchId) || null;
  }

  unmatch(matchId: string, userId: string): boolean {
    const match = this.matches.get(matchId);
    if (!match || !match.users.includes(userId)) return false;
    match.isActive = false;
    return true;
  }
}

export const matchingService = new MatchingService();
