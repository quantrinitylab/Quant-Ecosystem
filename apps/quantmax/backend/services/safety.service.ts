import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

// ============================================================================
// QuantMax Safety Service
// ============================================================================
//
// Backs the (previously dead) /safety/report + /safety/settings proxies:
//   - reportContent: persist a user abuse report (video / profile / message /
//     random-chat session) for moderation triage.
//   - get/updateSettings: per-user safety preferences (sensitive-content
//     filter, random-chat opt-out, unknown-message blocking, keyword filters).
//
// Pure + DI'd (narrow prisma) for testability.

export const REPORT_TARGET_TYPES = ['VIDEO', 'PROFILE', 'MESSAGE', 'CHAT_SESSION'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'NUDITY',
  'VIOLENCE',
  'HATE_SPEECH',
  'SELF_HARM',
  'MISINFORMATION',
  'UNDERAGE',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// Moderation lifecycle states (mirrors the prisma ReportStatus enum).
export const REPORT_STATUSES = ['PENDING', 'REVIEWING', 'ACTIONED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}

export interface ListReportsInput {
  status?: ReportStatus;
  page?: number;
  pageSize?: number;
}

export interface ListReportsResult {
  reports: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface SafetySettings {
  hideSensitiveContent: boolean;
  allowRandomChat: boolean;
  blockUnknownMessages: boolean;
  filteredKeywords: string[];
}

const DEFAULT_SETTINGS: SafetySettings = {
  hideSensitiveContent: true,
  allowRandomChat: true,
  blockUnknownMessages: false,
  filteredKeywords: [],
};

export class SafetyService {
  constructor(private readonly prisma: PrismaClient) {}

  async reportContent(reporterId: string, input: ReportInput) {
    if (!REPORT_TARGET_TYPES.includes(input.targetType)) {
      throw createAppError('Invalid report target type', 400, 'INVALID_TARGET_TYPE');
    }
    if (!REPORT_REASONS.includes(input.reason)) {
      throw createAppError('Invalid report reason', 400, 'INVALID_REASON');
    }
    const targetId = input.targetId?.trim();
    if (!targetId) {
      throw createAppError('Report target id is required', 400, 'INVALID_TARGET_ID');
    }
    const details = input.details?.trim();
    if (details && details.length > 5000) {
      throw createAppError('Report details are too long', 400, 'DETAILS_TOO_LONG');
    }

    return this.prisma.userReport.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId,
        reason: input.reason,
        details: details && details.length > 0 ? details : null,
        status: 'PENDING',
      },
    });
  }

  // ==========================================================================
  // Moderation queue (moderator/admin-facing).
  // ==========================================================================

  /**
   * List reports for moderation triage, newest-first, optionally filtered by
   * status and paginated. Returns the page of rows plus the total count so
   * callers can render pagination.
   */
  async listReports(input: ListReportsInput = {}): Promise<ListReportsResult> {
    if (input.status !== undefined && !REPORT_STATUSES.includes(input.status)) {
      throw createAppError('Invalid report status', 400, 'INVALID_STATUS');
    }

    const page = Math.max(1, Math.floor(input.page ?? 1));
    const requestedSize = Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize || DEFAULT_PAGE_SIZE));

    const where = input.status ? { status: input.status } : {};

    const [reports, total] = await Promise.all([
      this.prisma.userReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userReport.count({ where }),
    ]);

    return { reports, total, page, pageSize };
  }

  /**
   * Transition a report to a new lifecycle status. Validates the target
   * status, ensures the report exists, then persists the update and returns
   * the updated row.
   */
  async updateReportStatus(reportId: string, status: ReportStatus) {
    if (!REPORT_STATUSES.includes(status)) {
      throw createAppError('Invalid report status', 400, 'INVALID_STATUS');
    }
    const id = reportId?.trim();
    if (!id) {
      throw createAppError('Report id is required', 400, 'INVALID_REPORT_ID');
    }

    const existing = await this.prisma.userReport.findUnique({ where: { id } });
    if (!existing) {
      throw createAppError('Report not found', 404, 'REPORT_NOT_FOUND');
    }

    return this.prisma.userReport.update({
      where: { id },
      data: { status },
    });
  }

  /** The user's safety settings, falling back to safe defaults if unset. */
  async getSettings(userId: string): Promise<SafetySettings> {
    const row = await this.prisma.userSafetySetting.findUnique({ where: { userId } });
    if (!row) {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      hideSensitiveContent: Boolean(row.hideSensitiveContent),
      allowRandomChat: Boolean(row.allowRandomChat),
      blockUnknownMessages: Boolean(row.blockUnknownMessages),
      filteredKeywords: Array.isArray(row.filteredKeywords)
        ? (row.filteredKeywords as string[])
        : [],
    };
  }

  /** Upsert a partial settings patch onto the user's row (defaults for new). */
  async updateSettings(userId: string, patch: Partial<SafetySettings>): Promise<SafetySettings> {
    const current = await this.getSettings(userId);
    const next: SafetySettings = {
      hideSensitiveContent: patch.hideSensitiveContent ?? current.hideSensitiveContent,
      allowRandomChat: patch.allowRandomChat ?? current.allowRandomChat,
      blockUnknownMessages: patch.blockUnknownMessages ?? current.blockUnknownMessages,
      filteredKeywords: this.normalizeKeywords(patch.filteredKeywords ?? current.filteredKeywords),
    };

    await this.prisma.userSafetySetting.upsert({
      where: { userId },
      create: { userId, ...next },
      update: { ...next },
    });

    return next;
  }

  private normalizeKeywords(keywords: string[]): string[] {
    const cleaned = keywords
      .filter((k): k is string => typeof k === 'string')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);
    return Array.from(new Set(cleaned)).slice(0, 100);
  }
}
