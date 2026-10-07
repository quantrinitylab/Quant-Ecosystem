// ============================================================================
// AI Providers - Per-user model selection
// ============================================================================
//
// Pure resolution logic for "users can swap their model": given a user's chosen
// OpenRouter model id (a free-form preference), validate it against an optional
// allow-list and fall back to a configured default when the preference is
// missing or not permitted.
//
// This is intentionally pure and side-effect free (no env reads, no I/O) so it
// is trivially unit-testable. Persisting the preference is out of scope — this
// module only resolves which model id to use for a given request.

/** Source of the resolved model, useful for telemetry / UI hints. */
export type ModelResolutionSource = 'preference' | 'default';

export interface ResolveUserModelOptions {
  /**
   * Optional allow-list of permitted OpenRouter model ids. When provided and
   * non-empty, a preference is only honored if it is a member of this list;
   * otherwise the default is used. When omitted/empty, any non-empty preference
   * is honored.
   */
  allowed?: readonly string[];
  /** Default OpenRouter model id used when the preference can't be honored. */
  default: string;
}

export interface ResolvedUserModel {
  /** The OpenRouter model id to use. */
  model: string;
  /** Whether the user's preference was honored or the default was applied. */
  source: ModelResolutionSource;
}

function normalize(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve the OpenRouter model id for a user.
 *
 * Rules:
 *  - A missing/blank preference always resolves to `options.default`.
 *  - With an allow-list: the preference must be in the list to be honored;
 *    otherwise the default is applied. (The default is trusted as configured.)
 *  - Without an allow-list: any non-blank preference is honored.
 *
 * @returns the resolved OpenRouter model id.
 */
export function resolveUserModel(
  preference: string | null | undefined,
  options: ResolveUserModelOptions,
): string {
  return resolveUserModelDetailed(preference, options).model;
}

/**
 * Same resolution as {@link resolveUserModel} but returns whether the user's
 * preference was honored or the default was applied.
 */
export function resolveUserModelDetailed(
  preference: string | null | undefined,
  options: ResolveUserModelOptions,
): ResolvedUserModel {
  const fallback = normalize(options.default);
  const pref = normalize(preference);

  if (pref.length === 0) {
    return { model: fallback, source: 'default' };
  }

  const hasAllowList = Array.isArray(options.allowed) && options.allowed.length > 0;
  if (hasAllowList) {
    const allowed = options.allowed as readonly string[];
    if (allowed.includes(pref)) {
      return { model: pref, source: 'preference' };
    }
    return { model: fallback, source: 'default' };
  }

  return { model: pref, source: 'preference' };
}

/**
 * Convenience predicate: is a given model id permitted by an (optional)
 * allow-list? An absent/empty allow-list permits everything.
 */
export function isModelAllowed(
  modelId: string | null | undefined,
  allowed?: readonly string[],
): boolean {
  const id = normalize(modelId);
  if (id.length === 0) return false;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  return allowed.includes(id);
}
