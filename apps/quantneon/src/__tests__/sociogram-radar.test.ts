import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateUserLocation,
  getUserLocation,
  calculateHaversineDistanceKm,
  getNearbyUsers,
  ingestHashtagsFromPost,
  getTrendingHashtags,
  reportUser,
  updateReportStatus,
  getReports,
  getReportById,
  blockUser,
  unblockUser,
  isUserBlocked,
  hasDirectlyBlocked,
  muteUser,
  isUserMuted,
  unmuteUser,
  clearRadarForTesting,
  type ReportReason,
} from '../services/sociogram-radar.service';

describe('Sociogram Proximity Radar & Trending Hashtags Engine', () => {
  beforeEach(() => {
    clearRadarForTesting();
  });

  describe('1. Haversine Geodesic Distance Math', () => {
    it('returns 0 km for identical coordinates', () => {
      const distance = calculateHaversineDistanceKm(40.7128, -74.006, 40.7128, -74.006);
      expect(distance).toBe(0);
    });

    it('accurately computes distance between New York and London (~5570 km)', () => {
      // NYC: 40.7128, -74.0060; London: 51.5074, -0.1278
      const distance = calculateHaversineDistanceKm(40.7128, -74.006, 51.5074, -0.1278);
      expect(distance).toBeGreaterThan(5500);
      expect(distance).toBeLessThan(5600);
      expect(distance).toBeCloseTo(5570.22, 0);
    });

    it('accurately computes local urban distance between Times Square and Central Park (~3.2 km)', () => {
      // Times Square: 40.758896, -73.985130; Central Park: 40.785091, -73.968285
      const distance = calculateHaversineDistanceKm(40.758896, -73.98513, 40.785091, -73.968285);
      expect(distance).toBeGreaterThan(3.0);
      expect(distance).toBeLessThan(3.5);
      expect(distance).toBeCloseTo(3.24, 1);
    });
  });

  describe('2. User Location & Proximity Radar Discovery', () => {
    it('registers and updates user location with presence and timestamps', () => {
      const user = updateUserLocation('user_101', {
        username: 'alice',
        displayName: 'Alice Walker',
        avatarUrl: 'https://cdn.quant.network/avatars/alice.png',
        latitude: 37.7749,
        longitude: -122.4194,
        isOnline: true,
      });

      expect(user.userId).toBe('user_101');
      expect(user.username).toBe('alice');
      expect(user.isOnline).toBe(true);
      expect(user.lastSeenAt).toBeDefined();

      const retrieved = getUserLocation('user_101');
      expect(retrieved).toEqual(user);
    });

    it('discovers nearby users within default 25km radius sorted ascending by distance', () => {
      // Center: San Francisco downtown (37.7749, -122.4194)
      const centerLat = 37.7749;
      const centerLon = -122.4194;

      // User A: Mission District (~2.5 km)
      updateUserLocation('user_a', {
        username: 'alice_mission',
        displayName: 'Alice M',
        latitude: 37.7599,
        longitude: -122.4148,
        isOnline: true,
      });

      // User B: Oakland (~12 km)
      updateUserLocation('user_b', {
        username: 'bob_oakland',
        displayName: 'Bob O',
        latitude: 37.8044,
        longitude: -122.2712,
        isOnline: true,
      });

      // User C: San Jose (~65 km, beyond 25km radius)
      updateUserLocation('user_c', {
        username: 'carol_sj',
        displayName: 'Carol SJ',
        latitude: 37.3382,
        longitude: -121.8863,
        isOnline: true,
      });

      const nearby = getNearbyUsers(centerLat, centerLon);

      // Should include User A and User B, but exclude User C (> 25km)
      expect(nearby.length).toBe(2);
      expect(nearby[0].userId).toBe('user_a');
      expect(nearby[0].distanceKm).toBeLessThan(5);
      expect(nearby[1].userId).toBe('user_b');
      expect(nearby[1].distanceKm).toBeGreaterThan(10);
      expect(nearby[1].distanceKm).toBeLessThan(15);
      // Verify ascending distance ordering
      expect(nearby[0].distanceKm!).toBeLessThan(nearby[1].distanceKm!);
    });

    it('supports custom radius and limits', () => {
      const centerLat = 37.7749;
      const centerLon = -122.4194;

      updateUserLocation('u1', {
        username: 'u1',
        displayName: 'U1',
        latitude: 37.775,
        longitude: -122.4195,
      });
      updateUserLocation('u2', {
        username: 'u2',
        displayName: 'U2',
        latitude: 37.78,
        longitude: -122.42,
      });
      updateUserLocation('u3', {
        username: 'u3',
        displayName: 'U3',
        latitude: 37.79,
        longitude: -122.43,
      });

      // Limit to 2 closest
      const limited = getNearbyUsers(centerLat, centerLon, 25, 2);
      expect(limited.length).toBe(2);
    });

    it('filters by online status and excludes blocked users', () => {
      const centerLat = 37.7749;
      const centerLon = -122.4194;

      updateUserLocation('caller', {
        username: 'caller',
        displayName: 'Caller',
        latitude: 37.7749,
        longitude: -122.4194,
      });
      updateUserLocation('online_friend', {
        username: 'friend',
        displayName: 'Friend',
        latitude: 37.775,
        longitude: -122.4195,
        isOnline: true,
      });
      updateUserLocation('offline_user', {
        username: 'offline',
        displayName: 'Offline',
        latitude: 37.776,
        longitude: -122.4196,
        isOnline: false,
      });
      updateUserLocation('blocked_user', {
        username: 'bad_actor',
        displayName: 'Bad Actor',
        latitude: 37.7752,
        longitude: -122.4192,
        isOnline: true,
      });

      // Block bad_actor
      blockUser('caller', 'blocked_user');

      // Test with excludeUserId and onlyOnline
      const results = getNearbyUsers(centerLat, centerLon, 25, 50, {
        excludeUserId: 'caller',
        onlyOnline: true,
      });

      const userIds = results.map((u) => u.userId);
      expect(userIds).toContain('online_friend');
      expect(userIds).not.toContain('caller');
      expect(userIds).not.toContain('offline_user');
      expect(userIds).not.toContain('blocked_user');
    });
  });

  describe('3. Trending Hashtags Engine & Velocity Analytics', () => {
    it('extracts and normalizes hashtags from post content', () => {
      const postText =
        'Exploring the scenic trails of #Yosemite! Loving #NaturePhotography and #Sunset, #yosemite';
      const extracted = ingestHashtagsFromPost(postText);

      expect(extracted).toEqual(['#yosemite', '#naturephotography', '#sunset']);
    });

    it('returns empty array when content contains no hashtags', () => {
      const extracted = ingestHashtagsFromPost('Just a regular caption without tags.');
      expect(extracted).toEqual([]);
      expect(getTrendingHashtags()).toEqual([]);
    });

    it('tracks frequency and computes trending score and velocity', () => {
      const baseTime = new Date('2026-09-27T12:00:00Z').getTime();

      // Ingest #photography with multiple recent mentions -> velocity 'rising'
      ingestHashtagsFromPost('Check out my lens #photography', new Date(baseTime).toISOString());
      ingestHashtagsFromPost(
        'Golden hour shot #photography',
        new Date(baseTime + 10 * 60 * 1000).toISOString(),
      );
      ingestHashtagsFromPost(
        'Portrait session #photography',
        new Date(baseTime + 20 * 60 * 1000).toISOString(),
      );

      // Ingest #retro with older mentions (2 hours prior) -> velocity 'declining'
      const olderTime = baseTime - 90 * 60 * 1000;
      ingestHashtagsFromPost('Vintage vibes #retro', new Date(olderTime).toISOString());
      ingestHashtagsFromPost(
        'Old school tape #retro',
        new Date(olderTime + 5 * 60 * 1000).toISOString(),
      );

      const trending = getTrendingHashtags();
      expect(trending.length).toBe(2);

      const photoTag = trending.find((t) => t.hashtag === '#photography');
      expect(photoTag).toBeDefined();
      expect(photoTag?.count).toBe(3);
      expect(photoTag?.velocity).toBe('rising');
      expect(photoTag?.trendScore).toBeGreaterThan(0);

      const retroTag = trending.find((t) => t.hashtag === '#retro');
      expect(retroTag).toBeDefined();
      expect(retroTag?.count).toBe(2);
      expect(retroTag?.velocity).toBe('declining');

      // #photography should rank higher than #retro
      expect(trending[0].hashtag).toBe('#photography');
      expect(trending[0].trendScore).toBeGreaterThan(trending[1].trendScore);
    });

    it('calculates steady velocity when mention rate is balanced across windows', () => {
      const baseTime = new Date('2026-09-27T15:00:00Z').getTime();
      // 1 mention in prior window
      ingestHashtagsFromPost('#tech', new Date(baseTime - 80 * 60 * 1000).toISOString());
      // 1 mention in recent window
      ingestHashtagsFromPost('#tech', new Date(baseTime - 10 * 60 * 1000).toISOString());

      const trending = getTrendingHashtags();
      const techTag = trending.find((t) => t.hashtag === '#tech');
      expect(techTag?.velocity).toBe('steady');
    });

    it('respects limit parameter on getTrendingHashtags', () => {
      for (let i = 0; i < 10; i++) {
        ingestHashtagsFromPost(`Post with #tag${i}`);
      }

      const top3 = getTrendingHashtags(3);
      expect(top3.length).toBe(3);
    });
  });

  describe('4. User Safety & Moderation State Machine', () => {
    it('creates a user safety report with PENDING status', () => {
      const report = reportUser(
        'reporter_1',
        'spammer_2',
        'spam',
        'Sending unsolicited promotional links',
      );

      expect(report.reportId).toMatch(/^rep_/);
      expect(report.reporterUserId).toBe('reporter_1');
      expect(report.reportedUserId).toBe('spammer_2');
      expect(report.reason).toBe('spam');
      expect(report.details).toBe('Sending unsolicited promotional links');
      expect(report.status).toBe('PENDING');
      expect(report.createdAt).toBeDefined();

      const reports = getReports();
      expect(reports.length).toBe(1);
      expect(reports[0].reportId).toBe(report.reportId);
    });

    it('transitions report through moderation state machine: PENDING -> INVESTIGATING -> RESOLVED', () => {
      const reasons: ReportReason[] = [
        'harassment',
        'inappropriate_content',
        'hate_speech',
        'impersonation',
      ];
      const report = reportUser('victim_1', 'troll_99', reasons[0], 'Threatening messages');

      expect(report.status).toBe('PENDING');

      // Moderate to INVESTIGATING
      const inInvestigation = updateReportStatus(report.reportId, 'INVESTIGATING');
      expect(inInvestigation?.status).toBe('INVESTIGATING');

      // Moderate to RESOLVED
      const resolved = updateReportStatus(report.reportId, 'RESOLVED');
      expect(resolved?.status).toBe('RESOLVED');

      const fetched = getReportById(report.reportId);
      expect(fetched?.status).toBe('RESOLVED');
    });

    it('supports DISMISSED status for invalid reports', () => {
      const report = reportUser('user_a', 'user_b', 'spam', 'False alarm');
      const dismissed = updateReportStatus(report.reportId, 'DISMISSED');
      expect(dismissed?.status).toBe('DISMISSED');
    });

    it('returns null when updating non-existent report ID', () => {
      const result = updateReportStatus('non_existent_report', 'RESOLVED');
      expect(result).toBeNull();
    });
  });

  describe('5. Bidirectional Blocking & Muting Invariant', () => {
    it('blocks user and verifies bidirectional blocking check (isUserBlocked)', () => {
      const alice = 'usr_alice';
      const bob = 'usr_bob';

      expect(isUserBlocked(alice, bob)).toBe(false);
      expect(isUserBlocked(bob, alice)).toBe(false);

      // Alice blocks Bob
      const blocked = blockUser(alice, bob);
      expect(blocked).toBe(true);

      // Both directions should report blocked
      expect(isUserBlocked(alice, bob)).toBe(true);
      expect(isUserBlocked(bob, alice)).toBe(true);

      // Alice directly initiated the block, Bob did not
      expect(hasDirectlyBlocked(alice, bob)).toBe(true);
      expect(hasDirectlyBlocked(bob, alice)).toBe(false);

      // Unrelated user Charlie is unaffected
      const charlie = 'usr_charlie';
      expect(isUserBlocked(alice, charlie)).toBe(false);
      expect(isUserBlocked(bob, charlie)).toBe(false);
    });

    it('unblocks user and restores normal relationship', () => {
      const userA = 'user_a';
      const userB = 'user_b';

      blockUser(userA, userB);
      expect(isUserBlocked(userA, userB)).toBe(true);

      const unblocked = unblockUser(userA, userB);
      expect(unblocked).toBe(true);
      expect(isUserBlocked(userA, userB)).toBe(false);
      expect(isUserBlocked(userB, userA)).toBe(false);
    });

    it('maintains blocked status if both blocked each other and only one unblocks', () => {
      const userA = 'user_a';
      const userB = 'user_b';

      blockUser(userA, userB);
      blockUser(userB, userA);

      expect(isUserBlocked(userA, userB)).toBe(true);

      // User A unblocks User B, but User B still has User A blocked
      unblockUser(userA, userB);
      expect(isUserBlocked(userA, userB)).toBe(true);
      expect(isUserBlocked(userB, userA)).toBe(true);

      // User B unblocks User A -> now completely unblocked
      unblockUser(userB, userA);
      expect(isUserBlocked(userA, userB)).toBe(false);
      expect(isUserBlocked(userB, userA)).toBe(false);
    });

    it('rejects self-blocking', () => {
      const result = blockUser('user_self', 'user_self');
      expect(result).toBe(false);
      expect(isUserBlocked('user_self', 'user_self')).toBe(false);
    });

    it('supports muting and unmuting users independently of blocking', () => {
      const user1 = 'user_1';
      const user2 = 'user_2';

      expect(isUserMuted(user1, user2)).toBe(false);

      muteUser(user1, user2);
      expect(isUserMuted(user1, user2)).toBe(true);
      // Mute is unidirectional
      expect(isUserMuted(user2, user1)).toBe(false);

      unmuteUser(user1, user2);
      expect(isUserMuted(user1, user2)).toBe(false);
    });
  });

  describe('6. Test Isolation & State Reset', () => {
    it('resets all stores cleanly when clearRadarForTesting is invoked', () => {
      updateUserLocation('u1', { username: 'u1', displayName: 'U1', latitude: 10, longitude: 10 });
      ingestHashtagsFromPost('#clean');
      reportUser('u1', 'u2', 'spam');
      blockUser('u1', 'u2');
      muteUser('u1', 'u2');

      clearRadarForTesting();

      expect(getUserLocation('u1')).toBeUndefined();
      expect(getTrendingHashtags()).toEqual([]);
      expect(getReports()).toEqual([]);
      expect(isUserBlocked('u1', 'u2')).toBe(false);
      expect(isUserMuted('u1', 'u2')).toBe(false);
    });
  });
});
