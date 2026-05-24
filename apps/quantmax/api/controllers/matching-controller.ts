// ============================================================================
// QuantMax - Matching Controller
// ============================================================================

import { matchingService } from '../services/matching-service';
import type { UserProfile, MatchAction } from '../../src/types';

export class MatchingController {
  getRecommendations(userId: string, limit?: number) { return matchingService.getRecommendations(userId, limit); }
  processSwipe(userId: string, targetId: string, action: MatchAction) { return matchingService.processSwipe(userId, targetId, action); }
  getMatches(userId: string) { return matchingService.getMatches(userId); }
  getMatch(matchId: string) { return matchingService.getMatch(matchId); }
  unmatch(matchId: string, userId: string) { return matchingService.unmatch(matchId, userId); }
  getCompatibility(userId1: string, userId2: string) { return matchingService.calculateCompatibility(userId1, userId2); }
}

export const matchingController = new MatchingController();
