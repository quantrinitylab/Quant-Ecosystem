// ============================================================================
// Payment providers — multi-rail top-up (Stripe / Razorpay-UPI / PayPal / crypto)
// behind the vendor-neutral PaymentProvider port. Part of @quant/credits.
// ============================================================================
//
// PURPOSE
//   Req 2 of the credits economy: a user funds credits via their preferred rail
//   (UPI / PayPal / Stripe / crypto). Each rail is exposed as a port-conforming
//   PaymentProvider so BillingService is vendor-agnostic. A PaymentProviderRegistry
//   selects the rail by id and reports which rails are actually usable.
//
// HONEST FAIL-CLOSED DESIGN (Req 2.6, Correctness Property 4)
//   This package does NOT fabricate provider checkout sessions. A provider is
//   "configured" only when it has BOTH a webhook secret AND a concrete
//   session-creation transport (the real vendor SDK call, injected at the app
//   boundary). When unconfigured, createCheckoutSession FAILS CLOSED with
//   PROVIDER_NOT_CONFIGURED (503) — it never returns a fake redirect.
//
//   Webhook signature verification defaults to real HMAC-SHA256 (constant-time),
//   which matches Razorpay/crypto/generic webhooks; Stripe/PayPal can inject
//   their own scheme via `verify`. An unverified/forged webhook grants nothing.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createAppError } from './errors';
import type {
  PaymentProvider,
  CheckoutSessionInput,
  CheckoutHandle,
} from './payment-provider.port';

/** The canonical rail ids the economy supports. */
export type PaymentRailId = 'stripe' | 'razorpay' | 'paypal' | 'crypto';

export const PAYMENT_RAIL_IDS = ['stripe', 'razorpay', 'paypal', 'crypto'] as const;

/** The real vendor session-creation transport, injected at the app boundary. */
export type CheckoutSessionCreator = (
  input: CheckoutSessionInput,
) => Promise<CheckoutHandle> | CheckoutHandle;

/** A custom webhook signature verifier (Stripe/PayPal supply their scheme). */
export type SignatureVerifier = (payload: string, signature: string, secret: string) => boolean;

export interface ConfigurablePaymentProviderOptions {
  /** The rail id this provider serves (also its `name`). */
  name: string;
  /** Shared secret the rail signs webhooks with. Absent => verify fails closed. */
  webhookSecret?: string;
  /**
   * The concrete vendor session creator (real SDK call). Absent => the provider
   * is unconfigured and createCheckoutSession fails closed.
   */
  createSession?: CheckoutSessionCreator;
  /** Override the signature scheme (defaults to HMAC-SHA256 hex). */
  verify?: SignatureVerifier;
}

/** Constant-time HMAC-SHA256 (hex) verification — the default webhook scheme. */
export function hmacSha256Verify(payload: string, signature: string, secret: string): boolean {
  if (typeof payload !== 'string' || typeof signature !== 'string' || typeof secret !== 'string') {
    return false;
  }
  if (signature.length === 0 || secret.length === 0) return false;
  const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * A PaymentProvider whose checkout-session creation and webhook secret are
 * supplied by configuration. Fails closed when unconfigured.
 */
export class ConfigurablePaymentProvider implements PaymentProvider {
  readonly name: string;
  private readonly webhookSecret?: string;
  private readonly createSession?: CheckoutSessionCreator;
  private readonly verify: SignatureVerifier;

  constructor(options: ConfigurablePaymentProviderOptions) {
    if (!options?.name) {
      throw createAppError('payment provider requires a name', 500, 'PROVIDER_MISCONFIGURED');
    }
    this.name = options.name;
    this.webhookSecret = options.webhookSecret;
    this.createSession = options.createSession;
    this.verify = options.verify ?? hmacSha256Verify;
  }

  /** True when this rail can actually take a payment (secret + transport present). */
  isConfigured(): boolean {
    return (
      typeof this.webhookSecret === 'string' &&
      this.webhookSecret.length > 0 &&
      typeof this.createSession === 'function'
    );
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutHandle> {
    if (!this.createSession || !this.isConfigured()) {
      throw createAppError(
        `Payment rail '${this.name}' is not configured`,
        503,
        'PROVIDER_NOT_CONFIGURED',
      );
    }
    const handle = await this.createSession(input);
    // Defensive: never return a handle without a hosted redirect url.
    if (!handle?.url || !handle?.sessionId) {
      throw createAppError(
        `Payment rail '${this.name}' returned an invalid checkout handle`,
        502,
        'PROVIDER_BAD_RESPONSE',
      );
    }
    return { ...handle, provider: handle.provider ?? this.name };
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Fail closed when no secret is configured for this rail.
    const effectiveSecret = secret || this.webhookSecret || '';
    if (effectiveSecret.length === 0) return false;
    return this.verify(payload, signature, effectiveSecret);
  }

  parseEvent(payload: string): import('./payment-provider.port').PaymentEvent {
    const raw = JSON.parse(payload) as Record<string, unknown>;
    if (
      typeof raw?.['providerEventId'] !== 'string' ||
      (raw['providerEventId'] as string).length === 0
    ) {
      throw new Error('PaymentEvent.providerEventId is required');
    }
    if (typeof raw?.['type'] !== 'string') {
      throw new Error('PaymentEvent.type is required');
    }
    return raw as unknown as import('./payment-provider.port').PaymentEvent;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** A PaymentProvider that can report whether it is usable. */
export interface ConfigurableProvider extends PaymentProvider {
  isConfigured(): boolean;
}

/**
 * A registry of payment rails keyed by id. BillingService resolves the rail the
 * user chose; the UI lists {@link configuredRails} as the available top-up
 * methods.
 */
export class PaymentProviderRegistry {
  private readonly byId = new Map<string, ConfigurableProvider>();

  constructor(providers: ConfigurableProvider[] = []) {
    for (const p of providers) this.byId.set(p.name, p);
  }

  /** Register/replace a rail. */
  register(provider: ConfigurableProvider): void {
    this.byId.set(provider.name, provider);
  }

  /** Resolve a rail by id, or throw if unknown. */
  get(id: string): ConfigurableProvider {
    const p = this.byId.get(id);
    if (!p) {
      throw createAppError(`Unknown payment rail '${id}'`, 400, 'UNKNOWN_PAYMENT_RAIL');
    }
    return p;
  }

  /** Resolve a CONFIGURED rail by id, or fail closed. */
  getConfigured(id: string): ConfigurableProvider {
    const p = this.get(id);
    if (!p.isConfigured()) {
      throw createAppError(
        `Payment rail '${id}' is not configured`,
        503,
        'PROVIDER_NOT_CONFIGURED',
      );
    }
    return p;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** All registered rail ids. */
  rails(): string[] {
    return [...this.byId.keys()];
  }

  /** The rail ids that are actually usable right now (the user's payment options). */
  configuredRails(): string[] {
    return [...this.byId.entries()].filter(([, p]) => p.isConfigured()).map(([id]) => id);
  }
}

// ---------------------------------------------------------------------------
// Env-driven construction
// ---------------------------------------------------------------------------

/** Webhook secrets per rail, validated from the environment. */
const PaymentEnvSchema = z.object({
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_SECRET: z.string().min(1).optional(),
  CRYPTO_WEBHOOK_SECRET: z.string().min(1).optional(),
});

export type PaymentEnv = z.infer<typeof PaymentEnvSchema>;

/** Per-rail injected session creators + optional custom verifiers (app boundary). */
export interface PaymentRailWiring {
  createSession?: Partial<Record<PaymentRailId, CheckoutSessionCreator>>;
  verify?: Partial<Record<PaymentRailId, SignatureVerifier>>;
}

/**
 * Build a {@link PaymentProviderRegistry} for all four rails from the
 * environment. A rail becomes CONFIGURED only when it has both a webhook secret
 * (env) and a concrete session creator ({@link wiring}). Rails without those are
 * still registered but report `isConfigured() === false` and fail closed — so
 * the system never silently fakes a payment (Req 2.6).
 */
export function createPaymentProvidersFromEnv(
  env: NodeJS.ProcessEnv | PaymentEnv,
  wiring: PaymentRailWiring = {},
): PaymentProviderRegistry {
  const parsed = PaymentEnvSchema.parse({
    STRIPE_WEBHOOK_SECRET: env['STRIPE_WEBHOOK_SECRET'],
    RAZORPAY_WEBHOOK_SECRET: env['RAZORPAY_WEBHOOK_SECRET'],
    PAYPAL_WEBHOOK_SECRET: env['PAYPAL_WEBHOOK_SECRET'],
    CRYPTO_WEBHOOK_SECRET: env['CRYPTO_WEBHOOK_SECRET'],
  });

  const secrets: Record<PaymentRailId, string | undefined> = {
    stripe: parsed.STRIPE_WEBHOOK_SECRET,
    razorpay: parsed.RAZORPAY_WEBHOOK_SECRET,
    paypal: parsed.PAYPAL_WEBHOOK_SECRET,
    crypto: parsed.CRYPTO_WEBHOOK_SECRET,
  };

  const registry = new PaymentProviderRegistry();
  for (const id of PAYMENT_RAIL_IDS) {
    registry.register(
      new ConfigurablePaymentProvider({
        name: id,
        webhookSecret: secrets[id],
        createSession: wiring.createSession?.[id],
        verify: wiring.verify?.[id],
      }),
    );
  }
  return registry;
}
