import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

/**
 * Allowed creative types. Mirrors the `AdCreativeType` enum defined in
 * packages/database/prisma/schema.prisma. Kept in sync manually because the
 * service uses the narrow injected PrismaClient and does not import the
 * generated enum.
 */
export const AD_CREATIVE_TYPES = ['IMAGE', 'VIDEO', 'CAROUSEL', 'COLLECTION'] as const;
export type AdCreativeType = (typeof AD_CREATIVE_TYPES)[number];

export interface AdCreative {
  id: string;
  advertiserId: string;
  type: AdCreativeType;
  name: string;
  headline: string | null;
  description: string | null;
  mediaUrl: string | null;
  callToAction: string | null;
  landingUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCreativeInput {
  name: string;
  type?: string;
  headline?: string;
  description?: string;
  mediaUrl?: string;
  callToAction?: string;
  landingUrl?: string;
}

export interface UpdateCreativeInput {
  name?: string;
  type?: string;
  headline?: string;
  description?: string;
  mediaUrl?: string;
  callToAction?: string;
  landingUrl?: string;
}

function assertValidType(type: string): asserts type is AdCreativeType {
  if (!(AD_CREATIVE_TYPES as readonly string[]).includes(type)) {
    throw createAppError(
      `Invalid creative type. Allowed: ${AD_CREATIVE_TYPES.join(', ')}`,
      400,
      'INVALID_CREATIVE_TYPE',
    );
  }
}

export class AdCreativeService {
  constructor(private readonly prisma: PrismaClient) {}

  async createCreative(advertiserId: string, input: CreateCreativeInput): Promise<AdCreative> {
    if (!input.name || input.name.trim().length === 0) {
      throw createAppError('Creative name is required', 400, 'CREATIVE_NAME_REQUIRED');
    }

    const type = input.type ?? 'IMAGE';
    assertValidType(type);

    return this.prisma.adCreative.create({
      data: {
        advertiserId,
        type,
        name: input.name,
        headline: input.headline ?? null,
        description: input.description ?? null,
        mediaUrl: input.mediaUrl ?? null,
        callToAction: input.callToAction ?? null,
        landingUrl: input.landingUrl ?? null,
      },
    });
  }

  async listCreatives(advertiserId: string): Promise<AdCreative[]> {
    return this.prisma.adCreative.findMany({
      where: { advertiserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCreative(advertiserId: string, id: string): Promise<AdCreative> {
    const creative = await this.prisma.adCreative.findUnique({ where: { id } });

    if (!creative) {
      throw createAppError('Creative not found', 404, 'CREATIVE_NOT_FOUND');
    }

    if (creative.advertiserId !== advertiserId) {
      throw createAppError('Access denied for this creative', 403, 'CREATIVE_FORBIDDEN');
    }

    return creative;
  }

  async updateCreative(
    advertiserId: string,
    id: string,
    patch: UpdateCreativeInput,
  ): Promise<AdCreative> {
    // Ownership check (also throws 404 / 403 as appropriate).
    await this.getCreative(advertiserId, id);

    if (patch.type !== undefined) {
      assertValidType(patch.type);
    }

    if (patch.name !== undefined && patch.name.trim().length === 0) {
      throw createAppError('Creative name cannot be empty', 400, 'CREATIVE_NAME_REQUIRED');
    }

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data['name'] = patch.name;
    if (patch.type !== undefined) data['type'] = patch.type;
    if (patch.headline !== undefined) data['headline'] = patch.headline;
    if (patch.description !== undefined) data['description'] = patch.description;
    if (patch.mediaUrl !== undefined) data['mediaUrl'] = patch.mediaUrl;
    if (patch.callToAction !== undefined) data['callToAction'] = patch.callToAction;
    if (patch.landingUrl !== undefined) data['landingUrl'] = patch.landingUrl;

    return this.prisma.adCreative.update({
      where: { id },
      data,
    });
  }

  async deleteCreative(advertiserId: string, id: string): Promise<{ deleted: true }> {
    // Ownership check (also throws 404 / 403 as appropriate).
    await this.getCreative(advertiserId, id);

    await this.prisma.adCreative.delete({ where: { id } });
    return { deleted: true };
  }
}
