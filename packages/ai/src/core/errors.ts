// ============================================================================
// AI Core - Typed Errors
// ============================================================================

/**
 * Thrown when an AI inference cannot be completed against a real provider and
 * the engine is configured to fail closed (production / failClosed mode).
 *
 * This is the explicit, typed error that replaces the silent mock-response
 * fallback so that production never returns a fabricated/simulated payload.
 *
 * Satisfies Requirements 3.1 and 3.3 (fail-closed AI engine).
 */
export class AIProviderUnavailableError extends Error {
  /** Stable, machine-readable error code for callers/telemetry. */
  readonly code: string = 'AI_PROVIDER_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'AIProviderUnavailableError';
    // Restore prototype chain for instanceof checks across transpilation targets.
    Object.setPrototypeOf(this, AIProviderUnavailableError.prototype);
  }
}

/**
 * Thrown when an OpenRouter call is attempted but the provider has no API key
 * configured (`OPENROUTER_API_KEY` absent). This is a specialization of
 * {@link AIProviderUnavailableError} so existing fail-closed handling that
 * checks `instanceof AIProviderUnavailableError` keeps working, while exposing
 * a more specific `OPENROUTER_NOT_CONFIGURED` code for telemetry and callers
 * that want to surface a "configure OpenRouter" hint.
 *
 * The provider constructs lazily and only raises this when actually invoked —
 * importing or instantiating the provider without a key never throws.
 */
export class OpenRouterNotConfiguredError extends AIProviderUnavailableError {
  /** Stable, machine-readable error code for callers/telemetry. */
  override readonly code: string = 'OPENROUTER_NOT_CONFIGURED';

  constructor(
    message = 'OpenRouter is not configured. Set OPENROUTER_API_KEY to enable OpenRouter models.',
  ) {
    super(message);
    this.name = 'OpenRouterNotConfiguredError';
    Object.setPrototypeOf(this, OpenRouterNotConfiguredError.prototype);
  }
}
