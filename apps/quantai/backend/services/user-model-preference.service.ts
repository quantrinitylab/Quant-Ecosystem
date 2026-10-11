// ============================================================================
// QuantAI - Per-user model preference + routing resolution
// ============================================================================
//
// Durable per-user default model (OpenRouter id). The QuantAI ask/chat path
// resolves the model to use as: request-pinned model -> user preference ->
// platform default, honoring an optional allow-list, via @quant/ai's
// resolveUserModelDetailed. Live provider dispatch stays in UnifiedAIService;
// this service only decides WHICH model id to route to.

import { createAppError } from '@quant/server-core';
import { resolveUserModelDetailed, type ResolvedUserModel } from '@quant/ai';

/** The platform default when a user has expressed no preference. */
export const DEFAULT_USER_MODEL = 'openai/gpt-4o-mini';

interface UserModelPreferenceRow {
  id: string;
  userId: string;
  model: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Structural Prisma slice (the real client satisfies it at runtime). */
export interface UserModelPreferencePrisma {
  userModelPreference: {
    findUnique(args: { where: { userId: string } }): Promise<UserModelPreferenceRow | null>;
    upsert(args: {
      where: { userId: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<UserModelPreferenceRow>;
  };
}

export interface UserModelPreferenceOptions {
  /** Allow-list of permitted model ids (empty/omitted = allow any). */
  allowed?: string[];
  /** Platform default model. */
  defaultModel?: string;
  generateId?: () => string;
}

const MAX_MODEL_LEN = 120;

export class UserModelPreferenceService {
  private readonly allowed: string[] | undefined;
  private readonly defaultModel: string;
  private readonly generateId: () => string;

  constructor(
    private readonly prisma: UserModelPreferencePrisma,
    options: UserModelPreferenceOptions = {},
  ) {
    this.allowed = options.allowed;
    this.defaultModel = options.defaultModel ?? DEFAULT_USER_MODEL;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /** The user's stored preference, or null when none is set. */
  async getPreference(userId: string): Promise<string | null> {
    if (!userId) throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    const row = await this.prisma.userModelPreference.findUnique({ where: { userId } });
    return row?.model ?? null;
  }

  /** Set/replace the user's preferred model (validated against the allow-list). */
  async setPreference(userId: string, model: string): Promise<string> {
    if (!userId) throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    const trimmed = (model ?? '').trim();
    if (!trimmed || trimmed.length > MAX_MODEL_LEN) {
      throw createAppError('A valid model id is required', 400, 'INVALID_MODEL');
    }
    if (this.allowed && this.allowed.length > 0 && !this.allowed.includes(trimmed)) {
      throw createAppError(`Model '${trimmed}' is not allowed`, 400, 'MODEL_NOT_ALLOWED');
    }
    const row = await this.prisma.userModelPreference.upsert({
      where: { userId },
      update: { model: trimmed },
      create: { id: this.generateId(), userId, model: trimmed },
    });
    return row.model;
  }

  /**
   * Resolve the model to route a request to: an explicit request model wins;
   * otherwise the user's stored preference; otherwise the platform default. The
   * allow-list is enforced (a disallowed preference falls back to the default).
   */
  async resolve(userId: string, requestModel?: string | null): Promise<ResolvedUserModel> {
    const pinned = (requestModel ?? '').trim();
    const preference = pinned || (await this.getPreference(userId));
    return resolveUserModelDetailed(preference, {
      default: this.defaultModel,
      ...(this.allowed ? { allowed: this.allowed } : {}),
    });
  }
}

/** Env var carrying a comma-separated model allow-list (operator config). */
export const ALLOWED_MODELS_ENV_VAR = 'QUANTAI_ALLOWED_MODELS';

/**
 * Parse the operator-configured model allow-list from the environment.
 * Returns undefined when unset/empty, which keeps allow-list enforcement off
 * (any non-blank model is honored — same as before).
 */
export function getConfiguredAllowedModels(
  env: Record<string, string | undefined> = process.env,
): string[] | undefined {
  const raw = env[ALLOWED_MODELS_ENV_VAR];
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/**
 * Build a UserModelPreferenceService wired with the platform model policy
 * (operator allow-list + platform default). Chat/ask routes must use this
 * factory instead of `new` so request-model validation stays consistent:
 * a free-form `model` can never bypass the model policy on one route while
 * being enforced on another.
 */
export function createUserModelPreferenceService(
  prisma: UserModelPreferencePrisma,
): UserModelPreferenceService {
  const allowed = getConfiguredAllowedModels();
  return new UserModelPreferenceService(
    prisma,
    allowed ? { allowed, defaultModel: DEFAULT_USER_MODEL } : {},
  );
}
