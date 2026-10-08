/**
 * QM-BACK-002 — mutation context: optimistic-concurrency options + request-id
 * propagation for mail/thread mutations.
 *
 * Every guarded mutation accepts a trailing `MutationOptions`:
 * - `expectedVersion`: when present, the write is an atomic conditional
 *   update (WHERE id AND version = expectedVersion) and the version column is
 *   incremented. A mismatch raises VERSION_CONFLICT (409) with
 *   { resource, id, expectedVersion, currentVersion } so the client can
 *   re-read and retry. When absent, behaviour is unchanged (backward
 *   compatible) — the version column is still incremented.
 * - `requestId`: correlation identifier for the whole mutation path. It is
 *   taken from the effective `x-request-id` (see resolveRequestId), threaded
 *   through service methods, stamped into outbox event payloads (doc 23's
 *   correlationId), and available for logs.
 */
import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';

export const VERSION_CONFLICT = 'VERSION_CONFLICT';

/** Same safe pattern as server-core's request-id plugin. */
const SAFE_ID_PATTERN = /^[\w-]{1,128}$/;

export interface MutationOptions {
  /**
   * Optimistic-concurrency guard. Must be a non-negative integer matching the
   * row's current `version`. Omit for unguarded (legacy) behaviour.
   */
  expectedVersion?: number;
  /**
   * Per-id expected versions for batch mutations. Ids absent from the map are
   * written unguarded; ids present are guarded individually.
   */
  expectedVersions?: Record<string, number>;
  /** Correlation id for this mutation; generated when absent. */
  requestId?: string;
}

/**
 * Effective request id for a mutation path. Prefers the id the request-id
 * plugin already stamped on the reply (it validated the client's
 * `x-request-id` header or generated one), then the raw request header,
 * then generates `req_<uuid>`.
 */
export function resolveRequestId(
  request?: { headers?: Record<string, unknown> },
  reply?: { getHeader?: (name: string) => unknown },
): string {
  const candidates = [
    reply?.getHeader?.('x-request-id'),
    request?.headers?.['x-request-id'],
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && SAFE_ID_PATTERN.test(c)) return c;
  }
  return `req_${randomUUID()}`;
}

/**
 * Parse `expectedVersion` from a request body. Returns undefined when absent.
 * Throws 400 INVALID_EXPECTED_VERSION on non-integer / negative values so a
 * corrupt client state fails loudly instead of silently writing unguarded.
 */
export function parseExpectedVersion(body: unknown): number | undefined {
  const v = (body as { expectedVersion?: unknown } | null)?.expectedVersion;
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw createAppError(
      'expectedVersion must be a non-negative integer',
      400,
      'INVALID_EXPECTED_VERSION',
    );
  }
  return v;
}

/**
 * Parse per-id expected versions for batch bodies shaped like
 * `{ expectedVersions: { "<id>": <version> } }`.
 */
export function parseExpectedVersions(body: unknown): Record<string, number> | undefined {
  const m = (body as { expectedVersions?: unknown } | null)?.expectedVersions;
  if (m === undefined || m === null) return undefined;
  if (typeof m !== 'object' || Array.isArray(m)) {
    throw createAppError(
      'expectedVersions must be an object mapping id to version',
      400,
      'INVALID_EXPECTED_VERSION',
    );
  }
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(m as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw createAppError(
        `expectedVersions[${id}] must be a non-negative integer`,
        400,
        'INVALID_EXPECTED_VERSION',
      );
    }
    out[id] = v;
  }
  return out;
}

/**
 * Canonical optimistic-concurrency failure. 409 with machine-readable
 * details so the client can re-read the row and retry with the fresh version.
 */
export function versionConflictError(
  resource: 'Email' | 'EmailThread',
  id: string,
  expectedVersion: number,
  currentVersion: number,
) {
  return createAppError(
    `${resource} was modified by another writer: expected version ${expectedVersion}, current version ${currentVersion}. Re-read and retry.`,
    409,
    VERSION_CONFLICT,
    { resource, id, expectedVersion, currentVersion },
  );
}
