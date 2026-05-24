// ============================================================================
// QuantMax - Video Chat Controller
// ============================================================================

import { videoChatService } from '../services/videochat-service';
import type { VideoChatPreferences } from '../../src/types';

export class VideoChatController {
  joinQueue(userId: string, preferences: VideoChatPreferences) { return videoChatService.joinQueue(userId, preferences); }
  skip(userId: string) { return videoChatService.skip(userId); }
  endSession(userId: string) { return videoChatService.endSession(userId); }
  sendMessage(userId: string, content: string) { return videoChatService.sendTextMessage(userId, content); }
  getSession(userId: string) { return videoChatService.getUserSession(userId); }
  reportUser(userId: string, reason: string) { return videoChatService.reportUser(userId, reason); }
  getStats() { return { queueLength: videoChatService.getQueueLength(), activeSessions: videoChatService.getActiveSessionCount() }; }
}

export const videoChatController = new VideoChatController();
