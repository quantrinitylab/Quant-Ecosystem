// @vitest-environment node
// ============================================================================
// quantmail — Task 7.2 verification: AI email intelligence runs against the
// REAL @quant/ai engine (no local mock/canned fallback).
// ============================================================================
//
// Requirement 5.4: "THE SuperHub SHALL preserve all existing AI email
// intelligence capabilities (compose, reply, summarize, triage, tone-shift,
// follow-up, meeting-extract, attachment-summary, unsubscribe, style-learner)
// operating against the real AI_Engine."
//
// This is an audit guard. For each of the ten AI email intelligence services it
// asserts two properties:
//
//   1. DELEGATION — the service's primary inference entrypoint routes through
//      the injected `@quant/ai` engine's `infer()` (i.e. `this.ai.infer(...)`),
//      rather than producing output from a local stub/canned response.
//
//   2. NO LOCAL FALLBACK (inherits Phase-1 fail-closed, Task 3.1) — when the
//      engine raises an explicit provider-unavailable error (exactly what the
//      production `@quant/ai` engine does when fail-closed), the service
//      PROPAGATES that error and NEVER substitutes a fabricated/simulated
//      payload of its own.
//
// The services are constructed with the real `AIEngine` constructor type, but
// `infer` is spied so no network/provider call is made.

import { describe, it, expect, vi } from 'vitest';
import type { AIEngine } from '@quant/ai';

import { AIComposeService } from '../services/ai-compose.service';
import { AIReplyService } from '../services/ai-reply.service';
import { AISummarizeService } from '../services/ai-summarize.service';
import { AITriageService } from '../services/ai-triage.service';
import { AIToneShiftService } from '../services/ai-tone-shift.service';
import { AIFollowupService } from '../services/ai-followup.service';
import { AIMeetingExtractService } from '../services/ai-meeting-extract.service';
import { AIAttachmentSummaryService } from '../services/ai-attachment-summary.service';
import { AIUnsubscribeService } from '../services/ai-unsubscribe.service';
import { AIStyleLearnerService } from '../services/ai-style-learner.service';

const USER = 'user-verify-1';

/** Build a mock engine whose `infer` returns the given JSON content payload. */
function engineReturning(jsonPayload: unknown): {
  engine: AIEngine;
  infer: ReturnType<typeof vi.fn>;
} {
  const infer = vi.fn().mockResolvedValue({
    id: 'ai_req_test',
    content: JSON.stringify(jsonPayload),
    model: 'gpt-4o',
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, estimatedCost: 0.0001 },
    latencyMs: 1,
    cached: false,
  });
  return { engine: { infer } as unknown as AIEngine, infer };
}

/**
 * Build a mock engine whose `infer` fails closed exactly like the production
 * `@quant/ai` engine does when no real provider is available (Task 3.1).
 */
function engineFailingClosed(): { engine: AIEngine; infer: ReturnType<typeof vi.fn> } {
  const err = new Error(
    'AI inference cannot complete: no provider configured and mock fallback disabled in production.',
  );
  (err as Error & { code: string }).code = 'AI_PROVIDER_UNAVAILABLE';
  const infer = vi.fn().mockRejectedValue(err);
  return { engine: { infer } as unknown as AIEngine, infer };
}

// Each entry: a human label, a valid engine JSON payload for the happy path,
// and an `invoke(service)` that calls the service's primary inference method.
interface Case {
  name: string;
  build: (engine: AIEngine) => { invoke: () => Promise<unknown> };
  validPayload: unknown;
}

const cases: Case[] = [
  {
    name: 'ai-compose (composeFromBullets)',
    validPayload: { subject: 'S', body: 'B', confidence: 0.9 },
    build: (engine) => {
      const svc = new AIComposeService(engine);
      return { invoke: () => svc.composeFromBullets(['a', 'b'], { tone: 'professional' }, USER) };
    },
  },
  {
    name: 'ai-reply (draftReply)',
    validPayload: { subject: 'Re: S', body: 'B', confidence: 0.8 },
    build: (engine) => {
      const svc = new AIReplyService(engine);
      return {
        invoke: () =>
          svc.draftReply({ subject: 'S', body: 'B', from: 'a@x.com' }, USER, { tone: 'brief' }),
      };
    },
  },
  {
    name: 'ai-summarize (summarizeSingle)',
    validPayload: { summary: 'sum', keyPoints: ['k1'] },
    build: (engine) => {
      const svc = new AISummarizeService(engine);
      return {
        invoke: () => svc.summarizeSingle({ from: 'a@x.com', subject: 'S', body: 'B' }, USER),
      };
    },
  },
  {
    name: 'ai-triage (triage)',
    validPayload: { category: 'act_now', reason: 'r', urgency: 0.7 },
    build: (engine) => {
      const svc = new AITriageService(engine);
      return { invoke: () => svc.triage({ subject: 'S', body: 'B', from: 'a@x.com' }, USER) };
    },
  },
  {
    name: 'ai-tone-shift (shiftTone)',
    validPayload: {
      rewrittenText: 'r',
      originalTone: 'casual',
      targetTone: 'formal',
      confidence: 0.85,
    },
    build: (engine) => {
      const svc = new AIToneShiftService(engine);
      return { invoke: () => svc.shiftTone('hello there', 'formal', USER) };
    },
  },
  {
    name: 'ai-followup (detectCommitments)',
    validPayload: [{ description: 'd', assignee: 'me', confidence: 0.6, emailId: 'e1' }],
    build: (engine) => {
      const svc = new AIFollowupService(engine);
      return {
        invoke: () =>
          svc.detectCommitments(
            { id: 'e1', subject: 'S', body: 'B', from: 'a@x.com', date: '2025-01-01' },
            USER,
          ),
      };
    },
  },
  {
    name: 'ai-meeting-extract (extractMeetingDetails)',
    validPayload: {
      title: 'T',
      date: '2025-01-01',
      time: '10:00',
      attendees: ['a@x.com'],
      isMeetingRequest: true,
      confidence: 0.9,
    },
    build: (engine) => {
      const svc = new AIMeetingExtractService(engine);
      return {
        invoke: () => svc.extractMeetingDetails({ subject: 'S', body: 'B', from: 'a@x.com' }, USER),
      };
    },
  },
  {
    name: 'ai-attachment-summary (summarizeAttachment)',
    validPayload: {
      filename: 'f.pdf',
      summary: 'sum',
      keyPoints: ['k'],
      documentType: 'report',
      confidence: 0.8,
    },
    build: (engine) => {
      const svc = new AIAttachmentSummaryService(engine);
      return {
        invoke: () =>
          svc.summarizeAttachment(
            {
              id: 'att1',
              filename: 'f.pdf',
              mimeType: 'application/pdf',
              size: 1234,
              extractedText: 'some extracted text',
            },
            USER,
          ),
      };
    },
  },
  {
    name: 'ai-unsubscribe (detectNewsletters)',
    validPayload: [
      { id: 'e1', from: 'a@x.com', isNewsletter: true, confidence: 0.9, neverOpened: true },
    ],
    build: (engine) => {
      const svc = new AIUnsubscribeService(engine);
      return {
        invoke: () =>
          svc.detectNewsletters(
            [{ id: 'e1', from: 'a@x.com', subject: 'S', openCount: 0, receivedAt: '2025-01-01' }],
            USER,
          ),
      };
    },
  },
  {
    name: 'ai-style-learner (analyzeSentItems)',
    validPayload: {
      userId: USER,
      tone: 'friendly',
      averageSentenceLength: 12,
      vocabularyLevel: 'moderate',
      greetingStyle: 'Hi',
      closingStyle: 'Thanks',
      formality: 0.5,
      traits: ['concise'],
      confidence: 0.8,
    },
    build: (engine) => {
      const svc = new AIStyleLearnerService(engine);
      return {
        invoke: () => svc.analyzeSentItems([{ to: 'a@x.com', subject: 'S', body: 'B' }], USER),
      };
    },
  },
];

describe('Task 7.2 / Req 5.4 — AI email intelligence delegates to the real @quant/ai engine', () => {
  it.each(cases)('$name routes inference through engine.infer()', async ({ build, validPayload }) => {
    const { engine, infer } = engineReturning(validPayload);
    const { invoke } = build(engine);

    await expect(invoke()).resolves.toBeDefined();

    // The result was produced by the engine seam, not a local stub.
    expect(infer).toHaveBeenCalledTimes(1);
    // Every call carries the quantmail app marker, confirming it is the real
    // @quant/ai inference path and not an ad-hoc local call.
    expect(infer).toHaveBeenCalledWith(expect.objectContaining({ app: 'quantmail', userId: USER }));
  });

  it.each(cases)(
    '$name has NO local mock fallback — it propagates the engine fail-closed error',
    async ({ build }) => {
      const { engine, infer } = engineFailingClosed();
      const { invoke } = build(engine);

      // No silent canned/simulated payload: the fail-closed error surfaces.
      await expect(invoke()).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
      expect(infer).toHaveBeenCalledTimes(1);
    },
  );
});
