/**
 * EC-02 — QuantContextEnvelope constructors, validators and budget checks
 * (doc 22 §4, §5).
 *
 * Laws enforced here:
 * - Required fields (§4) are mandatory — missing fields fail closed.
 * - Unknown schema versions fail closed.
 * - Actor identity must be a non-empty opaque reference.
 * - Payload is purpose-bound and minimum-useful: assertBudget() enforces
 *   the declared byte budget (§5). The envelope carries context, never a
 *   full private dump.
 * - References are preferred over embedded data: envelopeFor() helpers in
 *   adopting packages should attach resourceRef instead of copying truth.
 */
import { QUANT_APP_IDS } from './capability-types';
import type { QuantAppId } from './capability-types';
import { ResourceContractError, RESOURCE_ERROR_CODES } from './resource-errors';
import { ENVELOPE_PURPOSES, ENVELOPE_SCHEMA_VERSION } from './resource-types';
import type {
  BudgetTier,
  CreateEnvelopeInput,
  EnvelopeActor,
  EnvelopeActorType,
  EnvelopePurpose,
  QuantContextEnvelope,
  QuantResourceRef,
} from './resource-types';
import { parseResourceRef } from './resource-ref';

const ACTOR_TYPES: readonly EnvelopeActorType[] = ['user', 'service', 'agent'] as const;

/** Default max payload bytes when the caller declares no budget (§5). */
export const DEFAULT_ENVELOPE_BUDGET_BYTES = 64 * 1024;

function randomId(): string {
  const cryptoRef =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertValidAppId(appId: string, field: 'sourceApp' | 'targetApp'): asserts appId is QuantAppId {
  if (!(QUANT_APP_IDS as readonly string[]).includes(appId)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.UNKNOWN_APP_ID,
      `Unknown ${field} '${appId}' — envelopes fail closed.`,
      { [field]: String(appId).slice(0, 64) },
    );
  }
}

function assertValidActor(actor: EnvelopeActor): void {
  if (typeof actor !== 'object' || actor === null) {
    throw new ResourceContractError(RESOURCE_ERROR_CODES.ACTOR_INVALID, 'Envelope actor is missing.');
  }
  if (!ACTOR_TYPES.includes(actor.type)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ACTOR_INVALID,
      `Unknown actor type '${String((actor as { type?: unknown }).type)}'.`,
    );
  }
  if (!isNonEmptyString(actor.id)) {
    throw new ResourceContractError(RESOURCE_ERROR_CODES.ACTOR_INVALID, 'Actor id must be non-empty.');
  }
}

function assertValidPurpose(purpose: EnvelopePurpose): void {
  if (!ENVELOPE_PURPOSES.includes(purpose)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.PURPOSE_NOT_ALLOWED,
      `Unknown envelope purpose '${String(purpose)}'.`,
    );
  }
}

function assertValidPayload(payload: unknown): void {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.PAYLOAD_INVALID,
      'Envelope payload must be a JSON object (typed, purpose-bound).',
    );
  }
}

/** Byte estimate of the serialized payload. */
export function estimatePayloadBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload) ?? '').length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Enforce the context budget (§5): payload must fit the declared (or
 * default) byte budget. Throws ENVELOPE_OVER_BUDGET — fail closed.
 */
export function assertBudget<TPayload>(
  envelope: QuantContextEnvelope<TPayload>,
  maxBytes?: number,
): void {
  const limit = maxBytes ?? envelope.budget?.byteEstimate ?? DEFAULT_ENVELOPE_BUDGET_BYTES;
  const actual = estimatePayloadBytes(envelope.payload);
  if (actual > limit) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ENVELOPE_OVER_BUDGET,
      `Envelope payload (${actual} bytes) exceeds budget (${limit} bytes) — pass a reference instead (§5).`,
      { actual: String(actual), limit: String(limit) },
    );
  }
}

/**
 * Create a validated QuantContextEnvelope. Defaults: eventId (uuid),
 * correlationId (= eventId), occurredAt (now), schemaVersion (current).
 * Missing/invalid required fields throw — fail closed (§4).
 */
export function createContextEnvelope<TPayload = Record<string, unknown>>(
  input: CreateEnvelopeInput<TPayload>,
): QuantContextEnvelope<TPayload> {
  assertValidActor(input.actor);
  assertValidAppId(input.sourceApp, 'sourceApp');
  if (input.targetApp !== undefined) assertValidAppId(input.targetApp, 'targetApp');
  assertValidPurpose(input.purpose);
  assertValidPayload(input.payload);

  const schemaVersion = input.schemaVersion ?? ENVELOPE_SCHEMA_VERSION;
  if (schemaVersion !== ENVELOPE_SCHEMA_VERSION) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ENVELOPE_VERSION_UNSUPPORTED,
      `Unsupported envelope schema version ${schemaVersion}.`,
      { schemaVersion: String(schemaVersion) },
    );
  }

  let resourceRef: QuantResourceRef | undefined;
  if (input.resourceRef !== undefined) {
    // Re-validate nested refs — never trust a foreign envelope blindly.
    resourceRef = parseResourceRef(input.resourceRef);
  }

  const eventId = input.eventId && isNonEmptyString(input.eventId) ? input.eventId : randomId();
  const envelope: QuantContextEnvelope<TPayload> = {
    eventId,
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    correlationId:
      input.correlationId && isNonEmptyString(input.correlationId) ? input.correlationId : eventId,
    ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    actor: { type: input.actor.type, id: input.actor.id, ...(input.actor.displayName ? { displayName: input.actor.displayName } : {}) },
    sourceApp: input.sourceApp,
    ...(input.targetApp !== undefined ? { targetApp: input.targetApp } : {}),
    ...(resourceRef !== undefined ? { resourceRef } : {}),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    purpose: input.purpose,
    payload: input.payload,
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
  };

  assertBudget(envelope);
  return envelope;
}

/** Structural guard — no throw. */
export function isContextEnvelope(value: unknown): value is QuantContextEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isNonEmptyString(v['eventId']) &&
    typeof v['schemaVersion'] === 'number' &&
    isNonEmptyString(v['correlationId']) &&
    typeof v['actor'] === 'object' &&
    v['actor'] !== null &&
    typeof v['sourceApp'] === 'string' &&
    typeof v['purpose'] === 'string' &&
    typeof v['payload'] === 'object' &&
    v['payload'] !== null
  );
}

/**
 * Fail-closed parse of an unknown value (e.g. received over the wire).
 */
export function parseContextEnvelope<TPayload = Record<string, unknown>>(
  value: unknown,
): QuantContextEnvelope<TPayload> {
  if (!isContextEnvelope(value)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ENVELOPE_MALFORMED,
      'Value is not a well-formed QuantContextEnvelope.',
    );
  }
  return createContextEnvelope<TPayload>({
    eventId: value.eventId,
    schemaVersion: value.schemaVersion,
    correlationId: value.correlationId,
    causationId: value.causationId as string | undefined,
    actor: value.actor as EnvelopeActor,
    sourceApp: value.sourceApp,
    targetApp: value.targetApp as string | undefined,
    resourceRef: value.resourceRef as QuantResourceRef | undefined,
    occurredAt: value.occurredAt as string | undefined,
    tenantId: value.tenantId as string | undefined,
    purpose: value.purpose as EnvelopePurpose,
    payload: value.payload as TPayload,
    budget: value.budget as CreateEnvelopeInput<TPayload>['budget'],
  });
}

/** Serialize for transport/storage. */
export function serializeEnvelope<TPayload>(envelope: QuantContextEnvelope<TPayload>): string {
  return JSON.stringify(envelope);
}

/** Deserialize + validate (fail closed). */
export function deserializeEnvelope<TPayload = Record<string, unknown>>(
  serialized: string,
): QuantContextEnvelope<TPayload> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ENVELOPE_MALFORMED,
      'Envelope is not valid JSON.',
    );
  }
  return parseContextEnvelope<TPayload>(parsed);
}

/**
 * Tenant-boundary check (§10): when both sides declare a tenant, they must
 * match — otherwise TENANT_MISMATCH (fail closed).
 */
export function assertTenantMatch(
  envelope: QuantContextEnvelope,
  expectedTenantId: string | undefined,
): void {
  if (envelope.tenantId !== undefined && expectedTenantId !== undefined) {
    if (envelope.tenantId !== expectedTenantId) {
      throw new ResourceContractError(
        RESOURCE_ERROR_CODES.TENANT_MISMATCH,
        'Envelope tenant does not match the expected tenant.',
      );
    }
  }
}

/** Budget tier ordering helper (§5 preferred transfer order). */
const TIER_ORDER: readonly BudgetTier[] = [
  'reference-only',
  'display-metadata',
  'user-selected',
  'extended',
] as const;

/** True when `a` is within (at or below) the allowed tier. */
export function isTierWithin(a: BudgetTier, allowedMax: BudgetTier): boolean {
  return TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(allowedMax);
}
