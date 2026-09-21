// ============================================================================
// signal-projector — event -> interest signal
// ============================================================================
//
// Pure mapping, no I/O, so the rules are testable on their own and a bad rule
// cannot be mistaken for a database problem.
//
// The projector is deliberately SELECTIVE. Not every domain event says something
// about what a person is interested in, and folding the ones that do not would
// dilute the signal rather than enrich it. An unrecognised event is skipped, not
// stored with a guessed weight.

/** The envelope shape `services/cdc-relay` writes to a Redis Stream. */
export interface StreamEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  occurredAt: string;
  /** The emitting app's payload, parsed. Untrusted: validate before reading. */
  payload: Record<string, unknown>;
}

export interface InterestSignal {
  userId: string;
  app: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  creatorId: string | null;
  category: string | null;
  weight: number;
  occurredAt: Date;
  eventId: string;
}

/**
 * How much each event type counts, and which app it came from.
 *
 * `Video.unliked` is NEGATIVE rather than a delete. Retracting a like is itself
 * information — "liked then unliked" is not the same as "never liked" — and Law 2
 * says history should not disappear. A scorer that wants net affinity sums the
 * weights; one that wants "ever engaged" counts the rows.
 */
const RULES: Record<string, { app: string; subjectType: string; weight: number }> = {
  'Video.liked': { app: 'quantube', subjectType: 'Video', weight: 1 },
  'Video.unliked': { app: 'quantube', subjectType: 'Video', weight: -1 },
};

/** Read a string field only if it really is a non-empty string. */
function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Project one stream event, or return null to skip it.
 *
 * Skips rather than throws on malformed input: the projector reads a stream it
 * does not control, and one unparseable event must not stall every event behind
 * it. The caller acknowledges skips so a permanently-bad event cannot block the
 * group forever.
 */
export function projectEvent(event: StreamEvent): InterestSignal | null {
  const rule = RULES[event.eventType];
  if (!rule) return null;

  // Without an actor there is no one to attribute the interest to, so the row
  // would be unreadable by every query this table exists to serve.
  const userId = str(event.payload, 'userId');
  if (!userId) return null;

  const occurredAt = new Date(event.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) return null;

  if (!event.eventId || !event.aggregateId) return null;

  return {
    userId,
    app: rule.app,
    eventType: event.eventType,
    subjectType: rule.subjectType,
    subjectId: event.aggregateId,
    creatorId: str(event.payload, 'creatorId'),
    category: str(event.payload, 'category'),
    weight: rule.weight,
    occurredAt,
    eventId: event.eventId,
  };
}

/** Event types this projector understands, for logging and the readiness note. */
export function knownEventTypes(): string[] {
  return Object.keys(RULES);
}
