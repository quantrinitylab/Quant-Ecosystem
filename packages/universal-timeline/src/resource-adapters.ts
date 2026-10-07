// ============================================================================
// Universal Timeline - EC-02 resource adapters (doc 22)
// ============================================================================
// Adoption of QuantResourceRef / QuantContextEnvelope in a real cross-app
// handoff: timeline events flow across all nine products untyped today.
// These adapters attach validated references and build purpose-bound
// context envelopes without changing the aggregator's core behavior.

import {
  tryCreateResourceRef,
  createResourceRef,
  createContextEnvelope,
  ResourceContractError,
  RESOURCE_ERROR_CODES,
} from '@quant/app-registry';
import type {
  QuantResourceRef,
  QuantContextEnvelope,
  EnvelopePurpose,
  EnvelopeActor,
  HandoffMode,
  ResourceProvenance,
} from '@quant/app-registry';
import type { TimelineEvent } from './types';

/**
 * Lenient: derive a typed ref from a timeline event's app/type/id.
 * Returns null for unknown producers — the timeline never drops events,
 * it just leaves them unreferenced (honest, per EC-02 law 6 scoping).
 */
export function timelineEventToResourceRef(event: TimelineEvent): QuantResourceRef | null {
  return tryCreateResourceRef({
    appId: event.app,
    resourceType: event.type,
    resourceId: event.id,
    canonicalUrl: event.resourceUrl,
    ownerUserId: event.userId,
  });
}

/**
 * Strict: attach a validated ref to an event. Fails closed when the ref's
 * identity coordinates don't match the event (RESOURCE_MISMATCH).
 */
export function attachResourceRef(event: TimelineEvent, ref: QuantResourceRef): TimelineEvent {
  if (ref.appId !== event.app || ref.resourceType !== event.type || ref.resourceId !== event.id) {
    throw new ResourceContractError(
      RESOURCE_ERROR_CODES.RESOURCE_MISMATCH,
      'Resource ref identity does not match the timeline event.',
      { eventApp: event.app, refApp: ref.appId },
    );
  }
  return { ...event, resourceRef: ref };
}

/**
 * Attach provenance to an event imported/derived from another app's object
 * (doc 22 §8) — answers where the object came from.
 */
export function attachProvenance(
  event: TimelineEvent,
  source: { appId: string; resourceType: string; resourceId: string },
  operation: ResourceProvenance['operation'],
  actor: string,
  correlationId: string,
): TimelineEvent {
  const sourceRef = createResourceRef(source); // strict: unknown source fails closed
  const provenance: ResourceProvenance = {
    source: sourceRef,
    operation,
    importedAt: new Date().toISOString(),
    actor,
    correlationId,
  };
  return { ...event, provenance };
}

/**
 * Convert a timeline event into a purpose-bound context envelope (doc 22 §4).
 * The envelope carries the ref + display metadata, never the full source
 * object (§5 context budget).
 */
export function timelineEventToEnvelope(
  event: TimelineEvent,
  purpose: EnvelopePurpose,
  actor: EnvelopeActor,
  opts?: { handoffMode?: HandoffMode; targetApp?: string },
): QuantContextEnvelope {
  const resourceRef = event.resourceRef ?? timelineEventToResourceRef(event) ?? undefined;
  return createContextEnvelope({
    actor,
    sourceApp: event.app,
    targetApp: opts?.targetApp,
    correlationId: event.id,
    purpose,
    resourceRef,
    payload: {
      title: event.title,
      description: event.description,
      importance: event.importance,
      timestamp: event.timestamp,
      ...(opts?.handoffMode ? { handoffMode: opts.handoffMode } : {}),
    },
    budget: { tier: resourceRef ? 'display-metadata' : 'reference-only', byteEstimate: 4096 },
  });
}
