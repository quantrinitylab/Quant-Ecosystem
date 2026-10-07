// ============================================================================
// Billing module — BillingService (checkout / subscriptions / signed webhooks)
// quantmail-superhub · Task 29.1 (Requirements 20.1, 20.2, 20.3, 20.4, 20.5)
// ============================================================================
//
// PURPOSE
//   Implements the design's `BillingService` (design §"BillingService — checkout
//   / subscriptions / webhooks"): the component that wraps the vendor-neutral
//   {@link PaymentProvider} port to start payments and apply their signed
//   webhooks to the {@link CreditWallet} and {@link PlanService}.
//
//   It satisfies the five acceptance criteria of Requirement 20:
//     • createCheckout -> a provider-hosted checkout handle; NO card data ever
//       touches the SuperHub (Req 20.1). A `pending` PaymentRecord is recorded.
//     • handleWebhook FIRST verifies the provider signature; an unverified event
//       is REJECTED and grants nothing (Req 20.2).
//     • a verified `payment_success` grants the purchased credits (top-up) or
//       activates/renews the subscription (and grants the plan's monthly
//       included credits), applied AT MOST ONCE per `providerEventId` (Req 20.3).
//     • a verified `payment_failure` marks the PaymentRecord failed and grants
//       nothing (Req 20.4).
//     • a subscription change (upgrade / downgrade / cancel / resume) is applied
//       through PlanService at the effective boundary (Req 20.5).
//
//   IDEMPOTENCY (Req 20.3): `PaymentRecord.providerEventId` is the at-most-once
//   key. Before applying any effect, the service checks whether an event with
//   that id has already been applied; if so it is a NO-OP. The DB-level
//   `@unique(providerEventId)` is the backstop that closes the concurrent-replay
//   race. Because credit grants are NOT individually idempotent, the service
//   prefers at-most-once (a grant is applied only by the FIRST processing of an
//   event id) over at-least-once.
//
// MODULE BOUNDARY
//   Infrastructure module (like `modules/code`). It does NOT import the mail
//   domain or QuantChat. It depends only on the sibling billing services
//   (CreditWallet, PlanService), the PaymentProvider port, and shared types.

import type { PrismaClient, PaymentRecord } from '@quant/database';
import { createAppError } from './errors';
import type { Credits } from './pricing-engine.service';
import { CreditWallet, type OwnerRef as WalletOwnerRef } from './credit-wallet.service';
import { PlanService, type PlanTier, type PlanOwnerRef } from './plan-service';
import type {
  CheckoutHandle,
  PaymentEvent,
  PaymentEventType,
  PaymentKind,
  PaymentProvider,
} from './payment-provider.port';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Identifies the owner a payment is billed to. */
export interface BillingOwnerRef {
  /** The owning user/org id. */
  ownerId: string;
  /** "user" | "org". Defaults to "user". */
  ownerType?: 'user' | 'org';
  /** The tenant the owner belongs to (carried for wallet/plan authz). */
  tenantId?: string;
}

/** Input to {@link BillingService.createCheckout}. */
export interface CreateCheckoutInput {
  /** topup (buy credits) | subscription (buy/upgrade a plan). */
  kind: PaymentKind;
  /** For a top-up: the whole-credit amount to purchase (> 0). */
  credits?: Credits;
  /** For a subscription: the target tier. */
  planTier?: PlanTier;
  /** Optional provider redirect targets. */
  successUrl?: string;
  cancelUrl?: string;
}

/** The result of {@link BillingService.createCheckout}. */
export interface CreateCheckoutResult {
  /** The provider-hosted checkout handle (redirect the customer here). */
  handle: CheckoutHandle;
  /** The `pending` PaymentRecord created for this checkout. */
  record: PaymentRecord;
}

/** The outcome of {@link BillingService.handleWebhook}. */
export interface WebhookResult {
  /** True when this call applied the event's effect; false on a duplicate. */
  applied: boolean;
  /** True when the event was a previously-applied duplicate (no-op). */
  duplicate: boolean;
  /** The normalized event type that was processed. */
  type: PaymentEventType;
  /** The at-most-once key of the processed event. */
  providerEventId: string;
  /** The PaymentRecord after processing (succeeded/failed/duplicate). */
  record: PaymentRecord;
  /** Credits granted by this processing (0 on failure/duplicate/subscription-only). */
  creditedAmount: Credits;
}

export interface BillingServiceOptions {
  /**
   * The shared secret the provider signs webhooks with. Required for
   * {@link BillingService.handleWebhook} to verify signatures (Req 20.2).
   */
  webhookSecret: string;
  /** Id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
  /**
   * Map a string `ownerRef` (as carried on a {@link PaymentEvent}) to a richer
   * owner ref. Defaults to treating the string as a user id. Override to carry
   * tenant / owner-type from your own customer mapping.
   */
  resolveOwner?(ownerRef: string): BillingOwnerRef;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveWholeCredits(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** True for a Prisma unique-constraint violation (a lost idempotency race). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

// ---------------------------------------------------------------------------
// BillingService
// ---------------------------------------------------------------------------

/**
 * Drives payments through the vendor-neutral {@link PaymentProvider} port and
 * applies their signed webhooks to the wallet and plan services.
 */
export class BillingService {
  private readonly webhookSecret: string;
  private readonly generateId: () => string;
  private readonly resolveOwner: (ownerRef: string) => BillingOwnerRef;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: PaymentProvider,
    private readonly wallet: CreditWallet,
    private readonly planService: PlanService,
    options: BillingServiceOptions,
  ) {
    if (!nonEmpty(options?.webhookSecret)) {
      throw createAppError('BillingService requires a webhookSecret', 500, 'BILLING_MISCONFIGURED');
    }
    this.webhookSecret = options.webhookSecret;
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
    this.resolveOwner =
      options.resolveOwner ?? ((ref: string): BillingOwnerRef => ({ ownerId: ref }));
  }

  /**
   * Start a credit top-up or subscription purchase and return a PROVIDER-HOSTED
   * checkout handle (Req 20.1).
   *
   * NO card data is processed by the SuperHub — the customer enters card details
   * on the provider's hosted page; we only persist a `pending` PaymentRecord
   * carrying the opaque session id. The matching signed webhook later resolves
   * this record to `succeeded`/`failed`.
   *
   * @throws 400 INVALID_KIND     when `kind` is not topup|subscription.
   * @throws 400 INVALID_AMOUNT   when a top-up has no positive credit amount.
   * @throws 400 INVALID_PLAN     when a subscription has no target tier.
   */
  async createCheckout(
    ownerRef: BillingOwnerRef,
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    if (!nonEmpty(ownerRef?.ownerId)) {
      throw createAppError('ownerRef.ownerId is required', 400, 'OWNER_REF_REQUIRED');
    }
    if (input?.kind !== 'topup' && input?.kind !== 'subscription') {
      throw createAppError(`Invalid checkout kind '${String(input?.kind)}'`, 400, 'INVALID_KIND');
    }
    if (input.kind === 'topup' && !isPositiveWholeCredits(input.credits)) {
      throw createAppError(
        'a top-up checkout requires a positive whole-credit amount',
        400,
        'INVALID_AMOUNT',
      );
    }
    if (input.kind === 'subscription' && !nonEmpty(input.planTier)) {
      throw createAppError(
        'a subscription checkout requires a target planTier',
        400,
        'INVALID_PLAN',
      );
    }

    // PROVIDER-HOSTED checkout (Req 20.1): the handle is an opaque session id +
    // redirect url. No card data is seen or stored locally.
    const handle = await this.provider.createCheckoutSession({
      ownerRef: ownerRef.ownerId,
      kind: input.kind,
      credits: input.credits,
      planTier: input.planTier,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });

    // Record a PENDING payment row keyed by the opaque session id (no card data).
    const record = await this.prisma.paymentRecord.create({
      data: {
        id: this.generateId(),
        ownerRef: ownerRef.ownerId,
        ownerType: ownerRef.ownerType ?? 'user',
        tenantId: ownerRef.tenantId ?? null,
        providerEventId: null,
        providerSessionId: handle.sessionId,
        providerSubId: null,
        kind: input.kind,
        status: 'pending',
        amountCredits: input.kind === 'topup' ? (input.credits ?? null) : null,
        planTier: input.kind === 'subscription' ? (input.planTier ?? null) : null,
      },
    });

    return { handle, record };
  }

  /**
   * Verify and apply a payment-provider webhook.
   *
   * STEP 1 (Req 20.2): verify the provider signature. An unverified event is
   * REJECTED (no record is touched, no credits are granted).
   * STEP 2: parse the event into a normalized {@link PaymentEvent}.
   * STEP 3 (Req 20.3, AT MOST ONCE): if an event with this `providerEventId` was
   * already applied, this is a NO-OP.
   * STEP 4: apply the effect —
   *   • `payment_success` (Req 20.3): top-up -> grant purchased credits;
   *     subscription -> activate/renew via PlanService and grant the plan's
   *     monthly included credits; mark the record succeeded.
   *   • `payment_failure` (Req 20.4): mark the record failed; grant nothing.
   *   • `subscription_*` (Req 20.5): apply upgrade/downgrade/cancel/resume via
   *     PlanService at the effective boundary.
   *
   * @throws 400 INVALID_WEBHOOK_SIGNATURE  when the signature does not verify.
   * @throws 400 INVALID_WEBHOOK_PAYLOAD    when the payload cannot be parsed.
   */
  async handleWebhook(rawPayload: string, signature: string): Promise<WebhookResult> {
    // STEP 1 (Req 20.2): VERIFY FIRST — reject an unverified/forged event so it
    // grants nothing.
    if (!this.provider.verifyWebhookSignature(rawPayload, signature, this.webhookSecret)) {
      throw createAppError(
        'Webhook signature verification failed',
        400,
        'INVALID_WEBHOOK_SIGNATURE',
      );
    }

    // STEP 2: parse the verified payload into the neutral event shape.
    let event: PaymentEvent;
    try {
      event = this.provider.parseEvent(rawPayload);
    } catch (err) {
      throw createAppError(
        `Unparseable webhook payload: ${(err as Error)?.message ?? 'unknown error'}`,
        400,
        'INVALID_WEBHOOK_PAYLOAD',
      );
    }
    if (!nonEmpty(event.providerEventId)) {
      throw createAppError(
        'webhook event is missing providerEventId',
        400,
        'INVALID_WEBHOOK_PAYLOAD',
      );
    }

    // STEP 3 (Req 20.3, AT MOST ONCE): a previously-applied event id is a no-op.
    const alreadyApplied = await this.prisma.paymentRecord.findFirst({
      where: { providerEventId: event.providerEventId },
    });
    if (alreadyApplied != null) {
      return {
        applied: false,
        duplicate: true,
        type: event.type,
        providerEventId: event.providerEventId,
        record: alreadyApplied,
        creditedAmount: 0,
      };
    }

    // STEP 4: apply the effect, claiming the event id atomically as the latch.
    switch (event.type) {
      case 'payment_success':
        return this.applyPaymentSuccess(event);
      case 'payment_failure':
        return this.applyPaymentFailure(event);
      case 'subscription_updated':
      case 'subscription_canceled':
      case 'subscription_resumed':
        return this.applySubscriptionChange(event);
      default:
        throw createAppError(
          `Unsupported webhook event type '${String(event.type)}'`,
          400,
          'UNSUPPORTED_WEBHOOK_EVENT',
        );
    }
  }

  // -------------------------------------------------------------------------
  // effect handlers
  // -------------------------------------------------------------------------

  /**
   * Apply a verified `payment_success` (Req 20.3): grant credits for a top-up or
   * activate/renew a subscription (and grant the plan's monthly included
   * credits). Marks the resolved PaymentRecord `succeeded`. The record's
   * `providerEventId` is the at-most-once latch.
   */
  private async applyPaymentSuccess(event: PaymentEvent): Promise<WebhookResult> {
    const owner = this.resolveOwner(event.ownerRef);
    const kind: PaymentKind = event.kind ?? (nonEmpty(event.planTier) ? 'subscription' : 'topup');

    // Latch the event id onto the resolved record FIRST so a concurrent replay
    // that lost the race trips the @unique(providerEventId) backstop.
    const record = await this.claimRecordForEvent(event, kind, 'succeeded');

    let creditedAmount = 0;
    if (kind === 'subscription') {
      const tier = (event.planTier ?? 'pro') as PlanTier;
      // ACTIVATE / RENEW immediately so entitlements reflect the paid tier now.
      await this.planService.changePlan(this.toPlanOwner(owner), tier, {
        effective: 'immediate',
        providerSubId: event.providerSubId,
      });
      // Grant the plan's monthly included credits for the (re)activated cycle.
      const ent = await this.planService.entitlements(this.toPlanOwner(owner));
      if (isPositiveWholeCredits(ent.monthlyIncludedCredits)) {
        await this.wallet.credit(this.toWalletOwner(owner), {
          amount: ent.monthlyIncludedCredits,
          kind: 'monthly_grant',
          sourceRef: event.providerEventId,
          reason: `monthly included credits for ${tier} subscription`,
        });
        creditedAmount = ent.monthlyIncludedCredits;
      }
    } else {
      // TOP-UP: grant the purchased credits into the PURCHASED bucket.
      const amount = event.amountCredits ?? record.amountCredits ?? 0;
      if (!isPositiveWholeCredits(amount)) {
        throw createAppError(
          'payment_success top-up is missing a positive credit amount',
          400,
          'INVALID_AMOUNT',
        );
      }
      await this.wallet.credit(this.toWalletOwner(owner), {
        amount,
        kind: 'purchase',
        sourceRef: event.providerEventId,
        reason: 'credit top-up purchase',
      });
      creditedAmount = amount;
    }

    return {
      applied: true,
      duplicate: false,
      type: event.type,
      providerEventId: event.providerEventId,
      record,
      creditedAmount,
    };
  }

  /**
   * Apply a verified `payment_failure` (Req 20.4): mark the PaymentRecord failed
   * and grant nothing.
   */
  private async applyPaymentFailure(event: PaymentEvent): Promise<WebhookResult> {
    const kind: PaymentKind = event.kind ?? (nonEmpty(event.planTier) ? 'subscription' : 'topup');
    const record = await this.claimRecordForEvent(event, kind, 'failed');
    return {
      applied: true,
      duplicate: false,
      type: event.type,
      providerEventId: event.providerEventId,
      record,
      creditedAmount: 0,
    };
  }

  /**
   * Apply a verified subscription change (Req 20.5): upgrade / downgrade / cancel
   * / resume through PlanService at the effective boundary. Cancel routes the
   * owner back to FREE; resume/upgrade/downgrade target the event's tier.
   */
  private async applySubscriptionChange(event: PaymentEvent): Promise<WebhookResult> {
    const owner = this.resolveOwner(event.ownerRef);
    const record = await this.claimRecordForEvent(event, 'subscription', 'succeeded');

    // Resolve the target tier + effective boundary for the requested action.
    const action = event.subscriptionAction;
    const targetTier: PlanTier =
      event.type === 'subscription_canceled' || action === 'cancel'
        ? 'free'
        : ((event.planTier ?? 'pro') as PlanTier);

    // A cancel/downgrade defaults to the next boundary; upgrade/resume to now.
    // An explicit `effective` on the event always wins.
    const effective: 'immediate' | 'period_end' | undefined =
      event.effective ??
      (event.type === 'subscription_canceled' || action === 'cancel' || action === 'downgrade'
        ? 'period_end'
        : action === 'resume' || action === 'upgrade'
          ? 'immediate'
          : undefined);

    await this.planService.changePlan(this.toPlanOwner(owner), targetTier, {
      effective,
      providerSubId: event.providerSubId,
    });

    return {
      applied: true,
      duplicate: false,
      type: event.type,
      providerEventId: event.providerEventId,
      record,
      creditedAmount: 0,
    };
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Resolve the PaymentRecord this event applies to and stamp it with the
   * event's at-most-once `providerEventId` + terminal status. Prefers updating
   * the `pending` checkout row matched by `providerSessionId`; otherwise creates
   * a fresh record (e.g. a provider-initiated subscription renewal). The
   * `@unique(providerEventId)` constraint is the concurrency backstop.
   */
  private async claimRecordForEvent(
    event: PaymentEvent,
    kind: PaymentKind,
    status: 'succeeded' | 'failed',
  ): Promise<PaymentRecord> {
    const owner = this.resolveOwner(event.ownerRef);

    // Try to resolve the pending checkout row by its opaque session id.
    const pending = nonEmpty(event.providerSessionId)
      ? await this.prisma.paymentRecord.findFirst({
          where: { providerSessionId: event.providerSessionId, providerEventId: null },
        })
      : null;

    try {
      if (pending != null) {
        return await this.prisma.paymentRecord.update({
          where: { id: pending.id },
          data: {
            providerEventId: event.providerEventId,
            providerSubId: event.providerSubId ?? pending.providerSubId ?? null,
            kind,
            status,
            amountCredits: event.amountCredits ?? pending.amountCredits ?? null,
            planTier: event.planTier ?? pending.planTier ?? null,
          },
        });
      }
      return await this.prisma.paymentRecord.create({
        data: {
          id: this.generateId(),
          ownerRef: owner.ownerId,
          ownerType: owner.ownerType ?? 'user',
          tenantId: owner.tenantId ?? null,
          providerEventId: event.providerEventId,
          providerSessionId: event.providerSessionId ?? null,
          providerSubId: event.providerSubId ?? null,
          kind,
          status,
          amountCredits: event.amountCredits ?? null,
          planTier: event.planTier ?? null,
        },
      });
    } catch (err) {
      // Lost the race on @unique(providerEventId): another worker is applying /
      // has applied this exact event. Surface it as a duplicate no-op signal.
      if (isUniqueViolation(err)) {
        throw createAppError('webhook event already being applied', 409, 'WEBHOOK_EVENT_DUPLICATE');
      }
      throw err;
    }
  }

  private toWalletOwner(owner: BillingOwnerRef): WalletOwnerRef {
    return { ownerId: owner.ownerId, ownerType: owner.ownerType, tenantId: owner.tenantId };
  }

  private toPlanOwner(owner: BillingOwnerRef): PlanOwnerRef {
    return { ownerId: owner.ownerId, ownerType: owner.ownerType, tenantId: owner.tenantId };
  }
}
