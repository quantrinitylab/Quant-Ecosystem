import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Campaign {
  id: string;
  advertiserId: string;
  name: string;
  objective: string;
  status: string;
  budget: unknown;
  schedule: unknown;
  targeting: unknown;
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CreateCampaignInput {
  advertiserId: string;
  name: string;
  objective?: string;
  budget?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  targeting?: Record<string, unknown>;
}

export interface UpdateCampaignInput {
  name?: string;
  objective?: string;
  budget?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  targeting?: Record<string, unknown>;
}

export interface CampaignStats {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  cpc: number;
}

export class CampaignService {
  constructor(private readonly prisma: PrismaClient) {}

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    return this.prisma.campaign.create({
      data: {
        advertiserId: input.advertiserId,
        name: input.name,
        objective: input.objective ?? 'AWARENESS',
        status: 'DRAFT',
        budget: input.budget ?? {},
        schedule: input.schedule ?? {},
        targeting: input.targeting ?? {},
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
      },
    });
  }

  async getCampaign(campaignId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return campaign;
  }

  async listCampaigns(
    advertiserId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Campaign>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { advertiserId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.campaign.count({ where: { advertiserId, deletedAt: null } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async updateCampaign(campaignId: string, input: UpdateCampaignInput): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { ...input, updatedAt: new Date() },
    });
  }

  async activateCampaign(campaignId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
      throw createAppError(
        'Campaign can only be activated from DRAFT or PAUSED status',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }

    // Validate budget exists
    const budget = campaign.budget as Record<string, unknown> | null;
    if (!budget || Object.keys(budget).length === 0) {
      throw createAppError('Campaign must have a budget before activation', 400, 'NO_BUDGET');
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'ACTIVE', updatedAt: new Date() },
    });
  }

  async pauseCampaign(campaignId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    if (campaign.status !== 'ACTIVE') {
      throw createAppError('Only active campaigns can be paused', 400, 'INVALID_STATUS_TRANSITION');
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED', updatedAt: new Date() },
    });
  }

  async resumeCampaign(campaignId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    if (campaign.status !== 'PAUSED') {
      throw createAppError(
        'Only paused campaigns can be resumed',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'ACTIVE', updatedAt: new Date() },
    });
  }

  async deleteCampaign(campaignId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { deletedAt: new Date() },
    });
  }

  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    const ctr =
      campaign.totalImpressions > 0 ? campaign.totalClicks / campaign.totalImpressions : 0;
    const cpc = campaign.totalClicks > 0 ? campaign.totalSpend / campaign.totalClicks : 0;

    return {
      totalSpend: campaign.totalSpend,
      totalImpressions: campaign.totalImpressions,
      totalClicks: campaign.totalClicks,
      totalConversions: campaign.totalConversions,
      ctr,
      cpc,
    };
  }
}
