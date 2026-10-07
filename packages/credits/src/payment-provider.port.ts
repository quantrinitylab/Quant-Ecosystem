// ============================================================================
// Billing module — vendor-neutral PaymentProvider port (Stripe-style adapter)
// quantmail-superhub · Task 29.1 (Requirements 20.1, 20.2, 20.3, 20.4, 20.5)
// ============================================================================
//
// PURPOSE
//   The design's `PaymentProvider` — a VENDOR-NEUTRAL port the `BillingService`
//   talks to (design §"PaymentProvider port — Stripe-style adapter"). It hides
//   the concrete payment vendor behind three capabilities:
//
//     • createCheckoutSession(input) -> a PROVIDER-HOSTED checkout handle
//       (opaque session id + redirect url). NO card data ever touches the
//       SuperHub (Req 20.1) — the customer enters card details on the
//       provider's hosted page.
//     • verifyWebhookSignature(payload, signature, secret) -> boolean. The
//       BillingService rejects any event whose signature does not verify, so an
//       unverified/forged webhook grants nothing (Req 20.2).
//     • parseEvent(payload) -> a normalized {@link PaymentEvent}. The vendor's
//       wire format is mapped to a single neutral shape keyed by
//       `providerEventId` (the at-most-once idempotency key, Req 20.3).
//
//   A deterministic {@link FakePaymentProvider} implements the port so the whole
//   billing flow is testable without a real Stripe account: its signature is an
//   HMAC-SHA256 of the raw payload under the shared secret, so a tampered
//   payload or wrong secret fails closed exactly like a real provider.
//
// MODULE BOUNDARY
//   Infrastructure module (like `modules/code`). It does NOT import the mail
//   domain or QuantChat. It depends only on Node's crypto + plain types.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Credits } from './pricing-engine.service';
import type { PlanTier } from './plan-service';

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/** What an owner is paying for. */
export type PaymentKind = 'topup' | 'subscription';

/** Input to {@link PaymentProvider.createCheckoutSession}. */
export interface CheckoutSessionInput {
  /** The owner (user/org id) the purchase is billed to. */
  ownerRef: string;
  /** Whether this is a one-off credit top-up or a subscription purchase. */
  kind: PaymentKind;
  /** For a top-up: the whole-credit amount being purchased. */
  credits?: Credits;
  /** For a subscription: the tier being purchased. */
  planTier?: PlanTier;
  /** Where the provider should send the customer after success. */
  successUrl?: string;
  /** Where the provider should send the customer on cancel. */
  cancelUrl?: string;
  /** Free-form metadata echoed back on the resulting webhook (never card data). */
  metadata?: Record<string, unknown>;
}

/**
 * A PROVIDER-HOSTED checkout handle (Req 20.1). The SuperHub redirects the
 * customer to {@link url}; the card is entered on the provider's page, so no
 * card data is processed locally. {@link sessionId} is the opaque correlation
 * id later echoed on the payment webhook.
 */
export interface CheckoutHandle {
  /** Opaque provider checkout session id. */
  sessionId: string;
  /** Hosted checkout URL the customer is redirected to. */
  url: string;
  /** The provider that minted this handle (e.g. "fake", "stripe"). */
  provider: string;
}

// ---------------------------------------------------------------------------
// Normalized webhook event
// ---------------------------------------------------------------------------

/**
 * The normalized webhook event types the BillingService understands. Concrete
 * vendor event names are mapped to these by {@link PaymentProvider.parseEvent}.
 */
export type PaymentEventType =
  | 'payment_success'
  | 'payment_failure'
  | 'subscription_updated'
  | 'subscription_canceled'
  | 'subscription_resumed';

/** A subscription lifecycle action carried by a `subscription_*` event. */
export type SubscriptionAction = 'upgrade' | 'downgrade' | 'cancel' | 'resume';

/**
 * A vendor-neutral payment event (design `PaymentEvent`). `providerEventId` is
 * the at-most-once idempotency key — the BillingService applies an event with a
 * given id exactly once (Req 20.3).
 */
export interface PaymentEvent {
  /** The provider's unique event id — the at-most-once application key. */
  providerEventId: string;
  /** The normalized event type. */
  type: PaymentEventType;
  /** The owner the event pertains to. */
  ownerRef: string;
  /** "user" | "org" (defaults to "user" when absent). */
  ownerType?: 'user' | 'org';
  /** The tenant the owner belongs to (carried for authz/isolation). */
  tenantId?: string;
  /** topup | subscription — the payment this event resolves. */
  kind?: PaymentKind;
  /** The opaque checkout session id this event resolves (links the pending record). */
  providerSessionId?: string;
  /** For a successful top-up: the whole-credit amount to grant. */
  amountCredits?: Credits;
  /** For a subscription event: the target tier. */
  planTier?: PlanTier;
  /** For a subscription event: the opaque provider subscription ref. */
  providerSubId?: string;
  /** For a subscription event: the lifecycle action requested. */
  subscriptionAction?: SubscriptionAction;
  /**
   * When a subscription change should take effect: `immediate` (now) or
   * `period_end` (the next reset boundary). Defaults are decided by PlanService.
   */
  effective?: 'immediate' | 'period_end';
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The vendor-neutral payment port. A production adapter wraps the real provider
 * SDK; {@link FakePaymentProvider} provides a deterministic test double.
 */
export interface PaymentProvider {
  /** A short provider id (e.g. "fake", "stripe"). */
  readonly name: string;
  /** Create a provider-hosted checkout session (no card data leaves the provider). */
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutHandle> | CheckoutHandle;
  /** Verify the raw webhook payload against its signature + shared secret. */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  /** Parse a raw webhook payload into a normalized {@link PaymentEvent}. */
  parseEvent(payload: string): PaymentEvent;
}

// ---------------------------------------------------------------------------
// Deterministic fake provider (testable without a real Stripe)
// ---------------------------------------------------------------------------

export interface FakePaymentProviderOptions {
  /** Provider id reported by {@link FakePaymentProvider.name}. Defaults to "fake". */
  name?: string;
  /** Base url for the hosted checkout page. Defaults to a local stub host. */
  checkoutBaseUrl?: string;
  /** Session-id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
}

/**
 * A deterministic {@link PaymentProvider} for tests and local development.
 *
 *   • `createCheckoutSession` returns a stable hosted-checkout handle and never
 *     sees card data.
 *   • `verifyWebhookSignature` recomputes `HMAC-SHA256(secret, payload)` and
 *     compares it (constant-time) to the supplied signature — so a tampered
 *     payload or wrong secret fails exactly like a real provider (Req 20.2).
 *   • `parseEvent` reads the JSON body the test (or a real provider) posts.
 *
 * {@link sign} is exposed so tests can mint a valid signature for a payload.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name: string;
  private readonly checkoutBaseUrl: string;
  private readonly generateId: () => string;

  constructor(options: FakePaymentProviderOptions = {}) {
    this.name = options.name ?? 'fake';
    this.checkoutBaseUrl = options.checkoutBaseUrl ?? 'https://pay.fake.test/checkout';
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  createCheckoutSession(_input: CheckoutSessionInput): CheckoutHandle {
    const sessionId = `cs_${this.generateId()}`;
    return {
      sessionId,
      url: `${this.checkoutBaseUrl}/${sessionId}`,
      provider: this.name,
    };
  }

  /** Compute the canonical signature for a payload under a secret (test helper). */
  sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (
      typeof payload !== 'string' ||
      typeof signature !== 'string' ||
      typeof secret !== 'string'
    ) {
      return false;
    }
    if (signature.length === 0 || secret.length === 0) return false;
    const expected = this.sign(payload, secret);
    // Constant-time compare; mismatched lengths are an immediate (safe) reject.
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseEvent(payload: string): PaymentEvent {
    const raw = JSON.parse(payload) as Partial<PaymentEvent>;
    if (typeof raw?.providerEventId !== 'string' || raw.providerEventId.length === 0) {
      throw new Error('PaymentEvent.providerEventId is required');
    }
    if (typeof raw?.type !== 'string') {
      throw new Error('PaymentEvent.type is required');
    }
    return raw as PaymentEvent;
  }
}
