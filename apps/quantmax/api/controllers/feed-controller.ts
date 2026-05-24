// ============================================================================
// QuantMax - Feed Controller
// ============================================================================

import { feedService } from '../services/feed-service';
import type { ShortVideo } from '../../src/types';

export class FeedController {
  getForYouFeed(userId: string, limit?: number, offset?: number) { return feedService.getForYouFeed(userId, limit, offset); }
  getFollowingFeed(userId: string, following: string[]) { return feedService.getFollowingFeed(userId, following); }
  getTrending(limit?: number) { return feedService.getTrending(limit); }
  searchVideos(query: string) { return feedService.searchVideos(query); }
  addVideo(video: ShortVideo) { feedService.addVideo(video); }
  recordEngagement(userId: string, videoId: string, data: any) { feedService.recordEngagement({ userId, videoId, ...data }); }
}

export const feedController = new FeedController();
