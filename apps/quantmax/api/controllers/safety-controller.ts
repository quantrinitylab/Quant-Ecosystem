// ============================================================================
// QuantMax - Safety Controller
// ============================================================================

import { safetyService } from '../services/safety-service';
import type { ReportReason } from '../../src/types';

export class SafetyController {
  submitReport(reporterId: string, reportedUserId: string, reason: ReportReason, description: string, evidence?: string[]) {
    return safetyService.submitReport(reporterId, reportedUserId, reason, description, evidence);
  }
  getReports(userId?: string) { return safetyService.getReports(userId); }
  blockUser(userId: string, blockedId: string) { return safetyService.blockUser(userId, blockedId); }
  unblockUser(userId: string, blockedId: string) { return safetyService.unblockUser(userId, blockedId); }
  getBlockedUsers(userId: string) { return safetyService.getBlockedUsers(userId); }
  moderateContent(content: string, type: 'text' | 'image' | 'video') { return safetyService.moderateContent(content, type); }
  submitVerification(userId: string, type: 'photo' | 'video' | 'id') { return safetyService.submitVerification(userId, type); }
  isBanned(userId: string) { return safetyService.isBanned(userId); }
}

export const safetyController = new SafetyController();
