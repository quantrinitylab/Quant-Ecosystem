// ============================================================================
// QuantAI - Admin-controlled AI provider priority/failover order
// ============================================================================
//
// Durable admin setting for the platform's provider priority order
// (Meta-first per the standing architecture directive). The ModelRouter reads
// it per request; reads are cached and fail-open so chat never breaks because
// the settings lookup failed. Writes are admin-only (enforced by the route).
//
// Security: provider availability is derived from env-var presence only —
// API key VALUES are never read, logged, or returned by this service.

import { createAppError } from '@quant/server-core';
import { getProviderConfig, listProviderIds } from '@quant/ai';

/** Compiled default order (Meta-first). Used when no row exists or on DB error. */
export const DEFAULT_PROVIDER_ORDER: string[] = [
  'meta',
  'openai',
  'anthropic',
  'google',
  'openrouter',
];

const GLOBAL_SCOPE = 'global';
const DEFAULT_CACHE_TTL_MS = 60_000;

interface AiProviderSettingsRow {
  id: string;
  scope: string;
  providerOrder: unknown;
  updatedBy: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Structural Prisma slice (the real client satisfies it at runtime). */
export interface AiProviderSettingsPrisma {
  aiProviderSettings: {
    findUnique(args: { where: { scope: string } }): Promise<AiProviderSettingsRow | null>;
    upsert(args: {
      where: { scope: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<AiProviderSettingsRow>;
  };
}

export interface AiProviderSettingsOptions {
  cacheTtlMs?: number;
  /** Test hook: observe fail-open DB errors without throwing. */
  onError?: (error: unknown) => void;
  generateId?: () => string;
}

export interface ProviderStatus {
  id: string;
  name: string;
  /** Whether the provider's API key is configured (derived from env presence). */
  available: boolean;
}

export interface ProviderSettingsStatus {
  order: string[];
  providers: ProviderStatus[];
  updatedAt: Date | string | null;
  updatedBy: string | null;
}

/**
 * Validate an admin-supplied provider order. Throws a 400 AppError when the
 * order is not a non-empty array of known, unique provider ids.
 */
export function validateProviderOrder(order: unknown): asserts order is string[] {
  const known = new Set<string>(listProviderIds());
  if (!Array.isArray(order) || order.length === 0) {
    throw createAppError(
      'order must be a non-empty array of provider ids',
      400,
      'INVALID_PROVIDER_ORDER',
    );
  }
  const seen = new Set<string>();
  for (const id of order) {
    if (typeof id !== 'string' || !known.has(id)) {
      throw createAppError(
        `Unknown provider id '${String(id)}'. Known providers: ${[...known].join(', ')}`,
        400,
        'UNKNOWN_PROVIDER',
      );
    }
    if (seen.has(id)) {
      throw createAppError(`Duplicate provider id '${id}'`, 400, 'DUPLICATE_PROVIDER');
    }
    seen.add(id);
  }
}

/** Parse a stored providerOrder value defensively; invalid → default order. */
function parseStoredOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [...DEFAULT_PROVIDER_ORDER];
  const known = new Set<string>(listProviderIds());
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of value) {
    if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return order.length > 0 ? order : [...DEFAULT_PROVIDER_ORDER];
}

export class AiProviderSettingsService {
  private readonly cacheTtlMs: number;
  private readonly onError?: (error: unknown) => void;
  private readonly generateId: () => string;
  private cache: { order: string[]; at: number } | null = null;

  constructor(
    private readonly prisma: AiProviderSettingsPrisma | null,
    options: AiProviderSettingsOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.onError = options.onError;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /** Invalidate the cached order (called after writes; also useful in tests). */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * The effective provider priority order. Fail-open: any DB error, a missing
   * Prisma client, or a corrupt row yields the compiled default order — chat
   * must never break because this lookup failed.
   */
  async getProviderOrder(): Promise<string[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cacheTtlMs) {
      return [...this.cache.order];
    }
    try {
      if (!this.prisma) return [...DEFAULT_PROVIDER_ORDER];
      const row = await this.prisma.aiProviderSettings.findUnique({
        where: { scope: GLOBAL_SCOPE },
      });
      const order = parseStoredOrder(row?.providerOrder);
      this.cache = { order, at: now };
      return [...order];
    } catch (error) {
      this.onError?.(error);
      return [...DEFAULT_PROVIDER_ORDER];
    }
  }

  /**
   * Persist a new admin-configured order (admin role enforced by the route).
   * Validates strictly; throws 400 on unknown/duplicate ids.
   */
  async setProviderOrder(
    order: string[],
    updatedBy: string,
  ): Promise<{ order: string[]; updatedAt: Date | string; updatedBy: string }> {
    validateProviderOrder(order);
    if (!this.prisma) {
      throw createAppError('Provider settings are not available', 503, 'SERVICE_UNAVAILABLE');
    }
    const row = await this.prisma.aiProviderSettings.upsert({
      where: { scope: GLOBAL_SCOPE },
      update: { providerOrder: order, updatedBy },
      create: { id: this.generateId(), scope: GLOBAL_SCOPE, providerOrder: order, updatedBy },
    });
    this.invalidateCache();
    return {
      order: [...order],
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy ?? updatedBy,
    };
  }

  /**
   * Current config + per-provider availability for the admin GET route.
   * Never includes API key values — only whether each provider's key is set.
   */
  async getStatus(): Promise<ProviderSettingsStatus> {
    const order = await this.getProviderOrder();
    let updatedAt: Date | string | null = null;
    let updatedBy: string | null = null;
    try {
      const row = await this.prisma?.aiProviderSettings.findUnique({
        where: { scope: GLOBAL_SCOPE },
      });
      updatedAt = row?.updatedAt ?? null;
      updatedBy = row?.updatedBy ?? null;
    } catch {
      // Fail-open: status still reports the effective order.
    }
    const providers: ProviderStatus[] = listProviderIds().map((id) => {
      const config = getProviderConfig(id);
      let available = false;
      try {
        available = config?.isAvailable() ?? false;
      } catch {
        available = false;
      }
      return { id, name: config?.name ?? id, available };
    });
    return { order, providers, updatedAt, updatedBy };
  }
}
