import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

/**
 * Valid AdSet lifecycle states. Mirrors the `AdSetStatus` enum declared in
 * packages/database/prisma/schema.prisma.
 */
export const AD_SET_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'] as const;
export type AdSetStatus = (typeof AD_SET_STATUSES)[number];

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  status: AdSetStatus;
  budget: unknown;
  targeting: unknown;
  placement: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdSetInput {
  name: string;
  budget?: Record<string, unknown>;
  targeting?: Record<string, unknown>;
  placement?: unknown[];
}

export interface UpdateAdSetInput {
  name?: string;
  budget?: Record<string, unknown>;
  targeting?: Record<string, unknown>;
  placement?: unknown[];
}

/**
 * AdSetService manages ad sets nested under a campaign. Ownership is always
 * enforced through the parent Campaign's `advertiserId` field — there is no
 * direct owner column on an ad set.
 */
export class AdSetService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Loads a campaign and verifies it belongs to `userId`.
   * Throws CAMPAIGN_NOT_FOUND (404) when missing/soft-deleted,
   * FORBIDDEN (403) when owned by someone else.
   */
  private async assertCampaignOwnership(userId: string, campaignId: string): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    if (campaign.advertiserId !== userId) {
      throw createAppError('You do not have access to this campaign', 403, 'FORBIDDEN');
    }
  }

  /**
   * Loads an ad set and verifies the caller owns its parent campaign.
   * Throws AD_SET_NOT_FOUND (404) when the ad set is missing.
   */
  private async getOwnedAdSet(userId: string, adSetId: string): Promise<AdSet> {
    const adSet = await this.prisma.adSet.findUnique({
      where: { id: adSetId },
    });

    if (!adSet) {
      throw createAppError('Ad set not found', 404, 'AD_SET_NOT_FOUND');
    }

    await this.assertCampaignOwnership(userId, adSet.campaignId);

    return adSet;
  }

  async createAdSet(userId: string, campaignId: string, input: CreateAdSetInput): Promise<AdSet> {
    await this.assertCampaignOwnership(userId, campaignId);

    return this.prisma.adSet.create({
      data: {
        id: randomUUID(),
        campaignId,
        name: input.name,
        status: 'DRAFT',
        budget: input.budget ?? {},
        targeting: input.targeting ?? {},
        placement: input.placement ?? [],
      },
    });
  }

  async listAdSets(userId: string, campaignId: string): Promise<AdSet[]> {
    await this.assertCampaignOwnership(userId, campaignId);

    return this.prisma.adSet.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAdSet(userId: string, adSetId: string): Promise<AdSet> {
    return this.getOwnedAdSet(userId, adSetId);
  }

  async updateAdSet(userId: string, adSetId: string, patch: UpdateAdSetInput): Promise<AdSet> {
    await this.getOwnedAdSet(userId, adSetId);

    return this.prisma.adSet.update({
      where: { id: adSetId },
      data: { ...patch, updatedAt: new Date() },
    });
  }

  async setStatus(userId: string, adSetId: string, status: string): Promise<AdSet> {
    if (!AD_SET_STATUSES.includes(status as AdSetStatus)) {
      throw createAppError(
        `Invalid ad set status: ${status}. Valid statuses: ${AD_SET_STATUSES.join(', ')}`,
        400,
        'INVALID_STATUS',
      );
    }

    await this.getOwnedAdSet(userId, adSetId);

    return this.prisma.adSet.update({
      where: { id: adSetId },
      data: { status, updatedAt: new Date() },
    });
  }
}
