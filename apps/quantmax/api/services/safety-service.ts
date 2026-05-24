// ============================================================================
// QuantMax - Safety Service
// Content moderation, identity verification, threat detection, reporting
// ============================================================================

import type { SafetyReport, ReportReason, UserProfile, VerificationStatus } from '../../src/types';

interface ModerationResult {
  safe: boolean;
  flags: string[];
  confidence: number;
  action: 'allow' | 'warn' | 'block' | 'review';
}

interface VerificationRequest {
  id: string;
  userId: string;
  type: 'photo' | 'video' | 'id';
  submittedAt: string;
  status: VerificationStatus;
  result?: { verified: boolean; reason?: string };
}

export class SafetyService {
  private reports: Map<string, SafetyReport> = new Map();
  private blockedUsers: Map<string, Set<string>> = new Map();
  private verificationRequests: Map<string, VerificationRequest> = new Map();
  private userStrikes: Map<string, number> = new Map();
  private bannedUsers: Set<string> = new Set();
  private MAX_STRIKES = 3;

  // Content Moderation
  moderateContent(content: string, type: 'text' | 'image' | 'video'): ModerationResult {
    const flags: string[] = [];
    let safe = true;

    // Text-based moderation
    if (type === 'text') {
      const harmful = this.detectHarmfulText(content);
      if (harmful.length > 0) { flags.push(...harmful); safe = false; }
    }

    // Determine action
    let action: ModerationResult['action'] = 'allow';
    if (!safe && flags.includes('severe')) action = 'block';
    else if (!safe) action = 'review';

    return { safe, flags, confidence: safe ? 0.95 : 0.85, action };
  }

  private detectHarmfulText(text: string): string[] {
    const flags: string[] = [];
    const lowered = text.toLowerCase();
    // Detect explicit solicitation, threats, spam patterns
    if (/\b(meet me|come over|my place)\b/i.test(lowered) && /\b(tonight|now|asap)\b/i.test(lowered)) {
      flags.push('potential_solicitation');
    }
    if (/\b(kill|hurt|attack|threaten)\b/i.test(lowered)) { flags.push('threat', 'severe'); }
    if (/(.)\1{10,}/.test(text) || /https?:\/\//i.test(text)) { flags.push('spam'); }
    return flags;
  }

  // Catfish Detection
  detectCatfish(profile: Partial<UserProfile>): { risk: number; flags: string[] } {
    const flags: string[] = [];
    let risk = 0;

    if (!profile.photos || profile.photos.length === 0) { flags.push('no_photos'); risk += 30; }
    else if (profile.photos.length === 1) { flags.push('single_photo'); risk += 15; }

    if (!profile.bio || profile.bio.length < 10) { flags.push('minimal_bio'); risk += 10; }
    if (profile.verified === 'unverified') { flags.push('unverified'); risk += 20; }

    // New account with aggressive behavior
    if (profile.createdAt) {
      const accountAge = (Date.now() - new Date(profile.createdAt).getTime()) / 86400000;
      if (accountAge < 1) { flags.push('very_new_account'); risk += 25; }
      else if (accountAge < 7) { flags.push('new_account'); risk += 10; }
    }

    return { risk: Math.min(risk, 100), flags };
  }

  // Reporting
  submitReport(reporterId: string, reportedUserId: string, reason: ReportReason, description: string, evidence?: string[]): SafetyReport {
    const report: SafetyReport = {
      id: `report_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      reporterId,
      reportedUserId,
      reason,
      description,
      evidence,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.reports.set(report.id, report);
    this.addStrike(reportedUserId);
    return report;
  }

  getReports(userId?: string): SafetyReport[] {
    const reports = Array.from(this.reports.values());
    if (userId) return reports.filter(r => r.reportedUserId === userId || r.reporterId === userId);
    return reports;
  }

  resolveReport(reportId: string, resolution: 'resolved' | 'dismissed'): boolean {
    const report = this.reports.get(reportId);
    if (!report) return false;
    report.status = resolution;
    if (resolution === 'dismissed') {
      this.removeStrike(report.reportedUserId);
    }
    return true;
  }

  // Blocking
  blockUser(userId: string, blockedId: string): boolean {
    const blocked = this.blockedUsers.get(userId) || new Set();
    blocked.add(blockedId);
    this.blockedUsers.set(userId, blocked);
    return true;
  }

  unblockUser(userId: string, blockedId: string): boolean {
    const blocked = this.blockedUsers.get(userId);
    if (!blocked) return false;
    return blocked.delete(blockedId);
  }

  isBlocked(userId: string, targetId: string): boolean {
    const blocked = this.blockedUsers.get(userId);
    return blocked?.has(targetId) || false;
  }

  getBlockedUsers(userId: string): string[] {
    return Array.from(this.blockedUsers.get(userId) || []);
  }

  // Strikes and Bans
  private addStrike(userId: string): void {
    const strikes = (this.userStrikes.get(userId) || 0) + 1;
    this.userStrikes.set(userId, strikes);
    if (strikes >= this.MAX_STRIKES) this.bannedUsers.add(userId);
  }

  private removeStrike(userId: string): void {
    const strikes = this.userStrikes.get(userId) || 0;
    if (strikes > 0) this.userStrikes.set(userId, strikes - 1);
  }

  isBanned(userId: string): boolean {
    return this.bannedUsers.has(userId);
  }

  // Identity Verification
  submitVerification(userId: string, type: 'photo' | 'video' | 'id'): VerificationRequest {
    const request: VerificationRequest = {
      id: `ver_${Date.now().toString(36)}`,
      userId,
      type,
      submittedAt: new Date().toISOString(),
      status: 'pending',
    };
    this.verificationRequests.set(request.id, request);
    return request;
  }

  processVerification(requestId: string, verified: boolean, reason?: string): boolean {
    const request = this.verificationRequests.get(requestId);
    if (!request) return false;
    request.status = verified ? 'verified' : 'rejected';
    request.result = { verified, reason };
    return true;
  }

  // Screenshot detection notification
  notifyScreenshot(userId: string, detectedBy: string): void {
    // In production, would send notification to user
    console.log(`[Safety] Screenshot detected by ${detectedBy} in chat with ${userId}`);
  }
}

export const safetyService = new SafetyService();
