/**
 * QuantMail SLO definitions (K12 — reliability).
 *
 * Implements `docs/quant-architecture/products/quantmail/backend/sre-slos.md`:
 * each critical journey defines an availability target, a latency target, an
 * error budget and a measurement window.
 *
 * NOTE on targets: sre-slos.md requires targets "set from measured baseline
 * and product criticality, not arbitrary marketing numbers". The values below
 * are conservative initial defaults for a mail product; they must be tuned
 * from the production baselines once the sloPlugin has collected a few weeks
 * of real observations.
 */
import type { SloDefinition, SloRouteMapping } from '@quant/server-core';

export const QUANTMAIL_SLOS: SloDefinition[] = [
  {
    id: 'quantmail.inbox-read',
    journey: 'Inbox read',
    description: 'Primary inbox list view (GET /emails).',
    availabilityTarget: 0.999,
    latencyTargetMs: 800,
    latencyPercentile: 0.99,
    windowHours: 720,
  },
  {
    id: 'quantmail.thread-open',
    journey: 'Thread open',
    description: 'Opening a single thread (GET /threads/:id).',
    availabilityTarget: 0.999,
    latencyTargetMs: 800,
    latencyPercentile: 0.99,
    windowHours: 720,
  },
  {
    id: 'quantmail.search',
    journey: 'Search',
    description: 'Full-text mail search (GET /search/emails).',
    availabilityTarget: 0.995,
    latencyTargetMs: 1500,
    latencyPercentile: 0.99,
    windowHours: 720,
  },
  {
    id: 'quantmail.send-queue',
    journey: 'Outbound submission (send/queue)',
    description: 'Compose/send accepted into the outbound queue.',
    availabilityTarget: 0.999,
    latencyTargetMs: 2000,
    latencyPercentile: 0.99,
    windowHours: 720,
  },
  {
    id: 'quantmail.inbound-acceptance',
    journey: 'Inbound acceptance',
    description: 'SNS inbound webhook accepted for ingest.',
    availabilityTarget: 0.999,
    latencyTargetMs: 1000,
    latencyPercentile: 0.99,
    windowHours: 720,
  },
];

/**
 * HTTP route → SLO journey mapping consumed by the sloPlugin. Patterns support
 * `:param` segments; a leading `/api` on the request path is ignored because
 * the ingress strips it before forwarding.
 */
export const QUANTMAIL_SLO_ROUTES: SloRouteMapping[] = [
  { method: 'GET', pattern: '/emails', sloId: 'quantmail.inbox-read' },
  { method: 'GET', pattern: '/threads/:id', sloId: 'quantmail.thread-open' },
  { method: 'GET', pattern: '/search/emails', sloId: 'quantmail.search' },
  { method: 'POST', pattern: '/emails', sloId: 'quantmail.send-queue' },
  { method: 'POST', pattern: '/emails/compose', sloId: 'quantmail.send-queue' },
  { method: 'POST', pattern: '/emails/:id/send', sloId: 'quantmail.send-queue' },
  { method: 'POST', pattern: '/webhook/inbound', sloId: 'quantmail.inbound-acceptance' },
];
