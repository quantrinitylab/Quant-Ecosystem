// ============================================================================
// Unit Tests: Flirtzy Matchmaking & Elo Radar Scoring Engine
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerUserProfile,
  calculateHaversineDistanceKm,
  getRecommendedMatches,
  recordSwipe,
  submitSelfieVerification,
  setVerificationChallenge,
  clearMatchmakingForTesting,
  type UserMatchProfile,
} from '../services/matchmaking.service';

describe('Flirtzy v1.5.0 Dating Matchmaking & Elo Radar Scoring Engine', () => {
  beforeEach(() => {
    clearMatchmakingForTesting();
  });

  describe('Haversine Distance Calculation', () => {
    it('calculates accurate distance between New York and London (~5570 km)', () => {
      // New York: 40.7128° N, -74.0060° W
      // London: 51.5074° N, -0.1278° W
      const distance = calculateHaversineDistanceKm(40.7128, -74.006, 51.5074, -0.1278);
      expect(distance).toBeGreaterThan(5500);
      expect(distance).toBeLessThan(5650);
    });

    it('calculates accurate distance between Delhi and Mumbai (~1148 km)', () => {
      // Delhi: 28.6139° N, 77.2090° E
      // Mumbai: 18.9750° N, 72.8258° E
      const distance = calculateHaversineDistanceKm(28.6139, 77.209, 18.975, 72.8258);
      expect(distance).toBeGreaterThan(1130);
      expect(distance).toBeLessThan(1170);
    });

    it('returns 0 km for identical coordinates', () => {
      const distance = calculateHaversineDistanceKm(28.6139, 77.209, 28.6139, 77.209);
      expect(distance).toBe(0);
    });
  });

  describe('Profile Registration & Recommendations', () => {
    const userA: UserMatchProfile = {
      userId: 'user_a',
      displayName: 'Alice',
      age: 26,
      gender: 'female',
      lookingFor: ['male'],
      location: { lat: 28.6139, lng: 77.209 }, // Delhi center
      eloRating: 1250,
      bio: 'Loves photography and hiking',
      interests: ['travel', 'photography'],
      verificationStatus: 'VERIFIED',
    };

    const userB: UserMatchProfile = {
      userId: 'user_b',
      displayName: 'Bob',
      age: 28,
      gender: 'male',
      lookingFor: ['female'],
      location: { lat: 28.63, lng: 77.22 }, // ~2 km from Delhi center
      eloRating: 1260,
      bio: 'Software engineer and foodie',
      interests: ['travel', 'music'],
      verificationStatus: 'VERIFIED',
    };

    const userC: UserMatchProfile = {
      userId: 'user_c',
      displayName: 'Charlie',
      age: 30,
      gender: 'male',
      lookingFor: ['female'],
      location: { lat: 28.7, lng: 77.25 }, // ~10 km from Delhi center
      eloRating: 1400, // Further Elo rating
      bio: 'Coffee lover',
      interests: ['coffee'],
      verificationStatus: 'UNVERIFIED',
    };

    const userFar: UserMatchProfile = {
      userId: 'user_far',
      displayName: 'Farrah',
      age: 27,
      gender: 'male',
      lookingFor: ['female'],
      location: { lat: 18.975, lng: 72.8258 }, // Mumbai (~1148 km away)
      eloRating: 1255,
      bio: 'Mumbai traveler',
      interests: ['travel'],
      verificationStatus: 'VERIFIED',
    };

    const userMismatchedGender: UserMatchProfile = {
      userId: 'user_mismatch',
      displayName: 'David',
      age: 25,
      gender: 'male',
      lookingFor: ['male'], // Looking for male only, Alice is female
      location: { lat: 28.62, lng: 77.21 }, // Nearby
      eloRating: 1250,
      bio: 'Guitar player',
      interests: ['music'],
      verificationStatus: 'VERIFIED',
    };

    it('respects mutual gender preferences and distance radius', () => {
      registerUserProfile(userA);
      registerUserProfile(userB);
      registerUserProfile(userC);
      registerUserProfile(userFar);
      registerUserProfile(userMismatchedGender);

      // Alice (female seeking male) within default 50km
      const recommendations = getRecommendedMatches(userA.userId, 50);

      const candidateIds = recommendations.map((r) => r.userId);
      // Bob and Charlie should be recommended
      expect(candidateIds).toContain(userB.userId);
      expect(candidateIds).toContain(userC.userId);

      // Mumbai candidate is >50km away, should be excluded
      expect(candidateIds).not.toContain(userFar.userId);

      // David seeks male, Alice is female -> mutual filter should exclude him
      expect(candidateIds).not.toContain(userMismatchedGender.userId);

      // Self should never be recommended
      expect(candidateIds).not.toContain(userA.userId);
    });

    it('sorts recommended matches by Elo proximity', () => {
      registerUserProfile(userA); // Elo: 1250
      registerUserProfile(userB); // Elo: 1260 (|1250 - 1260| = 10)
      registerUserProfile(userC); // Elo: 1400 (|1250 - 1400| = 150)

      const recommendations = getRecommendedMatches(userA.userId, 50);
      expect(recommendations.length).toBe(2);

      // Bob (Elo diff 10) must be ranked ahead of Charlie (Elo diff 150)
      expect(recommendations[0].userId).toBe(userB.userId);
      expect(recommendations[1].userId).toBe(userC.userId);
    });
  });

  describe('Swipe State Machine & Mutual Match Detection', () => {
    it('detects mutual match and generates an icebreaker question when both like each other', () => {
      const user1: UserMatchProfile = {
        userId: 'u_101',
        displayName: 'Maya',
        age: 24,
        gender: 'female',
        lookingFor: ['male'],
        location: { lat: 28.6139, lng: 77.209 },
        eloRating: 1200,
        bio: 'Explorer',
        interests: ['travel', 'music'],
        verificationStatus: 'VERIFIED',
      };

      const user2: UserMatchProfile = {
        userId: 'u_102',
        displayName: 'Liam',
        age: 26,
        gender: 'male',
        lookingFor: ['female'],
        location: { lat: 28.62, lng: 77.21 },
        eloRating: 1200,
        bio: 'Guitarist & hiker',
        interests: ['music', 'travel'],
        verificationStatus: 'VERIFIED',
      };

      registerUserProfile(user1);
      registerUserProfile(user2);

      // Step 1: Maya swipes LIKE on Liam
      const firstSwipe = recordSwipe(user1.userId, user2.userId, 'LIKE');
      expect(firstSwipe.action).toBe('LIKE');
      expect(firstSwipe.isMutualMatch).toBe(false);
      expect(firstSwipe.matchRecord).toBeUndefined();

      // Step 2: Liam swipes LIKE on Maya -> Mutual Match!
      const secondSwipe = recordSwipe(user2.userId, user1.userId, 'LIKE');
      expect(secondSwipe.action).toBe('LIKE');
      expect(secondSwipe.isMutualMatch).toBe(true);
      expect(secondSwipe.matchRecord).toBeDefined();

      const match = secondSwipe.matchRecord!;
      expect(match.user1Id).toBe(user2.userId);
      expect(match.user2Id).toBe(user1.userId);
      expect(typeof match.matchedAt).toBe('string');
      expect(match.isSuperMatch).toBe(false);

      // Verifies icebreaker question is generated and mentions mutual interest (travel or music)
      expect(match.icebreakerQuestion).toBeDefined();
      expect(typeof match.icebreakerQuestion).toBe('string');
      expect(match.icebreakerQuestion.length).toBeGreaterThan(10);
      expect(
        match.icebreakerQuestion.toLowerCase().includes('travel') ||
          match.icebreakerQuestion.toLowerCase().includes('music') ||
          match.icebreakerQuestion.toLowerCase().includes('coffee'),
      ).toBe(true);
    });

    it('does not create a match when one user passes', () => {
      const user1 = registerUserProfile({
        userId: 'u_p1',
        displayName: 'Peter',
        age: 29,
        gender: 'male',
        lookingFor: ['female'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: '',
        interests: [],
        verificationStatus: 'UNVERIFIED',
      });

      const user2 = registerUserProfile({
        userId: 'u_p2',
        displayName: 'Penny',
        age: 27,
        gender: 'female',
        lookingFor: ['male'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: '',
        interests: [],
        verificationStatus: 'UNVERIFIED',
      });

      // Peter likes Penny
      recordSwipe(user1.userId, user2.userId, 'LIKE');

      // Penny passes on Peter
      const passResult = recordSwipe(user2.userId, user1.userId, 'PASS');
      expect(passResult.isMutualMatch).toBe(false);
      expect(passResult.matchRecord).toBeUndefined();
    });

    it('throws error when user attempts to swipe on themselves', () => {
      expect(() => {
        recordSwipe('same_user', 'same_user', 'LIKE');
      }).toThrow();
    });
  });

  describe('SuperLike Match Detection', () => {
    it('triggers match with isSuperMatch: true when either user initiates SUPER_LIKE', () => {
      const userA = registerUserProfile({
        userId: 'u_sl_a',
        displayName: 'Sophia',
        age: 23,
        gender: 'female',
        lookingFor: ['male'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: 'Dancer',
        interests: ['dance'],
        verificationStatus: 'VERIFIED',
      });

      const userB = registerUserProfile({
        userId: 'u_sl_b',
        displayName: 'Lucas',
        age: 25,
        gender: 'male',
        lookingFor: ['female'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: 'Chef',
        interests: ['cooking'],
        verificationStatus: 'VERIFIED',
      });

      // Sophia sends SUPER_LIKE to Lucas
      const swipe1 = recordSwipe(userA.userId, userB.userId, 'SUPER_LIKE');
      expect(swipe1.action).toBe('SUPER_LIKE');
      expect(swipe1.isMutualMatch).toBe(false);

      // Lucas likes Sophia back
      const swipe2 = recordSwipe(userB.userId, userA.userId, 'LIKE');
      expect(swipe2.isMutualMatch).toBe(true);
      expect(swipe2.matchRecord).toBeDefined();
      expect(swipe2.matchRecord!.isSuperMatch).toBe(true);
    });

    it('triggers isSuperMatch: true if the reciprocal swiper sends SUPER_LIKE', () => {
      const userX = registerUserProfile({
        userId: 'u_x',
        displayName: 'Xander',
        age: 28,
        gender: 'male',
        lookingFor: ['female'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: '',
        interests: [],
        verificationStatus: 'UNVERIFIED',
      });

      const userY = registerUserProfile({
        userId: 'u_y',
        displayName: 'Yara',
        age: 26,
        gender: 'female',
        lookingFor: ['male'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: '',
        interests: [],
        verificationStatus: 'UNVERIFIED',
      });

      recordSwipe(userX.userId, userY.userId, 'LIKE');
      const reciprocalSwipe = recordSwipe(userY.userId, userX.userId, 'SUPER_LIKE');

      expect(reciprocalSwipe.isMutualMatch).toBe(true);
      expect(reciprocalSwipe.matchRecord!.isSuperMatch).toBe(true);
    });
  });

  describe('Selfie Verification Badge Gate', () => {
    it('sets verified badge when pose matches the assigned challenge', () => {
      const user = registerUserProfile({
        userId: 'u_verify_1',
        displayName: 'Elena',
        age: 22,
        gender: 'female',
        lookingFor: ['male'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: 'Art student',
        interests: ['art'],
        verificationStatus: 'UNVERIFIED',
      });

      // Set pose challenge to look_left
      setVerificationChallenge(user.userId, 'look_left');

      const result = submitSelfieVerification(
        user.userId,
        'https://cdn.quantwave.io/selfies/u_verify_1.jpg',
        'look_left',
      );

      expect(result.status).toBe('VERIFIED');
      expect(result.verifiedAt).toBeDefined();
      expect(user.verificationStatus).toBe('VERIFIED');
    });

    it('rejects verification when detected pose does not match the challenge', () => {
      const user = registerUserProfile({
        userId: 'u_verify_2',
        displayName: 'Ethan',
        age: 25,
        gender: 'male',
        lookingFor: ['female'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: '',
        interests: [],
        verificationStatus: 'UNVERIFIED',
      });

      // Assigned challenge: tilt_head
      setVerificationChallenge(user.userId, 'tilt_head');

      // User submitted smile instead of tilt_head
      const result = submitSelfieVerification(
        user.userId,
        'https://cdn.quantwave.io/selfies/u_verify_2.jpg',
        'smile',
      );

      expect(result.status).toBe('REJECTED');
      expect(result.verifiedAt).toBeUndefined();
      expect(user.verificationStatus).toBe('REJECTED');
    });

    it('supports default challenge when none is explicitly set', () => {
      const user = registerUserProfile({
        userId: 'u_verify_default',
        displayName: 'Dana',
        age: 24,
        gender: 'female',
        lookingFor: ['male'],
        location: { lat: 28.6, lng: 77.2 },
        eloRating: 1200,
        bio: '',
        interests: [],
        verificationStatus: 'UNVERIFIED',
      });

      // Default challenge is 'smile'
      const result = submitSelfieVerification(
        user.userId,
        'https://cdn.quantwave.io/selfies/u_verify_default.jpg',
        'smile',
      );

      expect(result.status).toBe('VERIFIED');
      expect(user.verificationStatus).toBe('VERIFIED');
    });
  });
});
