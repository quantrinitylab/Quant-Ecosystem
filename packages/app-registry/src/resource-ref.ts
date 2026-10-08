/**
 * EC-02 — QuantResourceRef constructors, validators and serialization
 * (doc 22 §2, §3, §7, §9).
 *
 * Laws enforced here:
 * - Unknown app/resource types fail closed (throw, never null).
 * - resourceId must be a non-empty opaque string.
 * - deepLink follows the canonical quant:// routes (§7).
 * - A reference never grants authorization — documented on the type and
 *   enforced by consumers re-authorizing at the owner.
 */
import { QUANT_APP_IDS } from './capability-types';
import type { QuantAppId } from './capability-types';
import { ResourceContractError, RESOURCE_ERROR_CODES } from './resource-errors';
import {
  RESOURCE_CONTRACT_VERSION,
  RESOURCE_VOCABULARY,
  DEEP_LINK_ROUTES,
  TYPE_PREFIX_TO_APP,
} from './resource-types';
import type {
  CreateResourceRefInput,
  QuantResourceRef,
  ResourceVisibility,
} from './resource-types';

const VISIBILITIES: readonly ResourceVisibility[] = ['private', 'shared', 'public'] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertValidAppId(appId: string): asserts appId is QuantAppId {
  if (!(QUANT_APP_IDS as readonly string[]).includes(appId)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.UNKNOWN_APP_ID,
      `Unknown app id '${appId}' — cross-app references fail closed.`,
      { appId: String(appId).slice(0, 64) },
    );
  }
}

function assertValidResourceType(appId: QuantAppId, resourceType: string): void {
  const allowed = RESOURCE_VOCABULARY[appId] ?? [];
  if (!allowed.includes(resourceType)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.UNKNOWN_RESOURCE_TYPE,
      `Unknown resource type '${resourceType}' for app '${appId}' — references fail closed.`,
      { appId, resourceType: String(resourceType).slice(0, 64) },
    );
  }
}

function assertValidResourceId(resourceId: string): void {
  if (!isNonEmptyString(resourceId) || resourceId.length > 512) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.MALFORMED_RESOURCE_ID,
      'resourceId must be a non-empty opaque string (max 512 chars).',
    );
  }
}

function assertValidVisibility(visibility: ResourceVisibility): void {
  if (!VISIBILITIES.includes(visibility)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ENVELOPE_MALFORMED,
      `Invalid visibility '${visibility}'.`,
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Canonical deep link for a resource type (§7), e.g.
 * 'quant://mail/thread/abc123'. Falls back to 'quant://<app>/resource/<id>'
 * for vocabulary types without a canonical route — never throws.
 */
export function deepLinkFor(appId: QuantAppId, resourceType: string, resourceId: string): string {
  const route = DEEP_LINK_ROUTES[resourceType];
  const encoded = encodeURIComponent(resourceId);
  if (route) return `quant://${route}/${encoded}`;
  return `quant://${appId}/resource/${encoded}`;
}

/** Parse a quant:// deep link back into app/resource coordinates (§7). */
export function parseDeepLink(deepLink: string): { appId: QuantAppId; resourceType: string; resourceId: string } {
  // Greedy route path: everything except the final segment is the route.
  const match = /^quant:\/\/(.+)\/([^/]+)$/.exec(deepLink.trim());
  if (!match) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.DEEP_LINK_INVALID,
      'Deep link must match quant://<route>/<id>.',
    );
  }
  const routePath = match[1] as string;
  const encodedId = match[2] as string;
  let resourceId: string;
  try {
    resourceId = decodeURIComponent(encodedId);
  } catch {
    throw new ResourceContractError(RESOURCE_ERROR_CODES.DEEP_LINK_INVALID, 'Deep link id is not valid encoding.');
  }
  if (!isNonEmptyString(resourceId)) {
    throw new ResourceContractError(RESOURCE_ERROR_CODES.DEEP_LINK_INVALID, 'Deep link id is empty.');
  }
  // Resolve canonical route → resource type.
  for (const [resourceType, route] of Object.entries(DEEP_LINK_ROUTES)) {
    if (routePath === route) {
      const prefix = resourceType.split('.')[0] as string;
      const appId = TYPE_PREFIX_TO_APP[prefix];
      if (!appId) {
        throw new ResourceContractError(
          RESOURCE_ERROR_CODES.UNKNOWN_APP_ID,
          `No canonical app for resource type prefix '${prefix}'.`,
        );
      }
      return { appId, resourceType, resourceId };
    }
  }
  // Fallback shape quant://<app>/resource/<id>.
  const fallback = /^([^/]+)\/resource$/.exec(routePath);
  if (fallback) {
    const fallbackApp = fallback[1] as string;
    assertValidAppId(fallbackApp);
    return { appId: fallbackApp, resourceType: `${fallbackApp}.resource`, resourceId };
  }
  throw new ResourceContractError(
    RESOURCE_ERROR_CODES.DEEP_LINK_INVALID,
    `Unknown deep-link route '${routePath}'.`,
  );
}

/**
 * Create a validated QuantResourceRef. Unknown app/type, malformed ids and
 * bad visibility throw ResourceContractError — fail closed (§2).
 */
export function createResourceRef(input: CreateResourceRefInput): QuantResourceRef {
  assertValidAppId(input.appId);
  assertValidResourceType(input.appId, input.resourceType);
  assertValidResourceId(input.resourceId);
  const visibility = input.visibility ?? 'private';
  assertValidVisibility(visibility);

  const timestamp = nowIso();
  return {
    version: RESOURCE_CONTRACT_VERSION,
    appId: input.appId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    ...(input.resourceVersion !== undefined ? { resourceVersion: input.resourceVersion } : {}),
    visibility,
    ...(input.canonicalUrl !== undefined ? { canonicalUrl: input.canonicalUrl } : {}),
    deepLink: input.deepLink ?? deepLinkFor(input.appId, input.resourceType, input.resourceId),
    ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
    ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Lenient constructor for paths that must never break on unknown producers
 * (e.g. search indexing): returns null instead of throwing. Strict paths
 * must use createResourceRef.
 */
export function tryCreateResourceRef(input: CreateResourceRefInput): QuantResourceRef | null {
  try {
    return createResourceRef(input);
  } catch {
    return null;
  }
}

/** Structural type guard — no throw. */
export function isResourceRef(value: unknown): value is QuantResourceRef {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['version'] === RESOURCE_CONTRACT_VERSION &&
    typeof v['appId'] === 'string' &&
    typeof v['resourceType'] === 'string' &&
    isNonEmptyString(v['resourceId']) &&
    typeof v['visibility'] === 'string'
  );
}

/**
 * Fail-closed parse of an unknown value (e.g. JSON from another app).
 * Structural check first, then full contract validation.
 */
export function parseResourceRef(value: unknown): QuantResourceRef {
  if (!isResourceRef(value)) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ENVELOPE_MALFORMED,
      'Value is not a well-formed QuantResourceRef.',
    );
  }
  return createResourceRef({
    appId: value.appId,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
    resourceVersion: value.resourceVersion,
    visibility: value.visibility as ResourceVisibility,
    canonicalUrl: value.canonicalUrl,
    deepLink: value.deepLink,
    ownerUserId: value.ownerUserId,
    tenantId: value.tenantId,
  });
}

/** Serialize for transport/storage. */
export function serializeResourceRef(ref: QuantResourceRef): string {
  return JSON.stringify(ref);
}

/** Deserialize + validate (fail closed). */
export function deserializeResourceRef(serialized: string): QuantResourceRef {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.ENVELOPE_MALFORMED,
      'Resource ref is not valid JSON.',
    );
  }
  return parseResourceRef(parsed);
}

/**
 * Stale-version check (§2 resourceVersion): returns true when the incoming
 * ref is older than the known version — caller decides tombstone/stale UI.
 */
export function isStaleVersion(knownVersion: string | undefined, incoming: QuantResourceRef): boolean {
  if (!incoming.resourceVersion) return false;
  if (!knownVersion) return false;
  return incoming.resourceVersion !== knownVersion;
}

/** Equality on identity coordinates (app + type + id). */
export function sameResource(a: QuantResourceRef, b: QuantResourceRef): boolean {
  return a.appId === b.appId && a.resourceType === b.resourceType && a.resourceId === b.resourceId;
}
