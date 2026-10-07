// ============================================================================
// quantmail-superhub · Task 23.1 — cross-cutting ownership authz + OTel spans
// applied across the Answer Engine, the Agent Runtime, and delivery
// (Requirements 22.1, 22.2, 22.3, 23.2)
// ============================================================================
//
// End-to-end-ish coverage that the cross-cutting filter + observability seam are
// actually WIRED into the pillars (not just defined in shared/):
//
//   1. ANSWER ENGINE retrieval DENIES unauthorized cross-owner access — a chunk
//      owned by another user is dropped, failing closed (Req 22.1/22.3), and the
//      injectable ownership port is consulted.
//   2. AGENT RUNTIME DENIES unauthorized cross-owner AND cross-tenant tool
//      actions — a step against a resource the session principal does not own
//      fails closed with 403 OWNERSHIP_AUTHZ_DENIED and marks the session FAILED
//      (Req 22.1/22.2).
//   3. SPANS are emitted for delivery (outbound enqueue + inbound ingest), agent
//      steps, and retrieval (Req 23.2).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Retriever } from '../modules/answers/services/retriever.service';
import {
  InMemoryKeywordSearchPort,
  InMemoryVectorSearchPort,
  type InMemoryChunk,
} from '../modules/answers/services/retriever-adapters';
import { AgentRuntime, type ResourceOwnershipPort } from '../modules/agent/services/agent-runtime.service';
import type { ToolExecutionLoop, Observation } from '../modules/agent/services/tool-execution-loop';
import { OutboundDeliveryPipeline } from '../services/outbound-delivery.service';
import { InboundIngestAdapter, type InboundRawMessage } from '../services/inbound-ingest.service';
import { RecordingSpanPort } from '../shared/observability';
import type { OwnershipAuthzPort } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// 1. Answer Engine retrieval — ownership filter DENIES cross-owner access
// ---------------------------------------------------------------------------

const fixedEmbedder = { async embedQuery() { return [1, 0, 0]; } };

function chunk(id: string, userId: string, emailId: string): InMemoryChunk {
  return { id, userId, sourceType: 'email', sourceRef: { emailId }, text: 'revenue', embedding: [1, 0, 0] };
}

describe('Answer Engine retrieval — ownership filter denies cross-owner access (Req 22.1/22.3)', () => {
  it('drops a chunk owned by another user (fails closed) under the default owner-only filter', async () => {
    const corpus = [chunk('c-alice', 'alice', 'em-1'), chunk('c-bob', 'bob', 'em-2')];
    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: new InMemoryVectorSearchPort([...corpus]),
      keywordStore: new InMemoryKeywordSearchPort([...corpus]),
    });

    const results = await retriever.retrieve('alice', 'revenue');

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.userId === 'alice')).toBe(true);
    expect(results.map((r) => r.chunkId)).not.toContain('c-bob');
  });

  it('consults the injectable ownership port and fails closed when it DENIES every chunk', async () => {
    const corpus = [chunk('c-alice', 'alice', 'em-1')];
    const denyAll: OwnershipAuthzPort = { isAuthorized: vi.fn(() => false) };

    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: new InMemoryVectorSearchPort([...corpus]),
      keywordStore: new InMemoryKeywordSearchPort([...corpus]),
      authz: denyAll,
    });

    const results = await retriever.retrieve('alice', 'revenue');

    expect(results).toEqual([]); // every chunk denied -> nothing leaks
    expect(denyAll.isAuthorized).toHaveBeenCalled();
    // The principal/resource handed to the filter carries owner + chunk identity.
    expect((denyAll.isAuthorized as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toEqual({
      principalId: 'alice',
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Agent Runtime — ownership filter DENIES cross-owner / cross-tenant actions
// ---------------------------------------------------------------------------

type SessionRow = {
  id: string;
  userId: string;
  repoId: string;
  instruction: string;
  status: string;
  branchRef: string;
  maxIterations: number;
  iterationCount: number;
  costBudget: number;
  costSpent: number;
  linkedPrId: string | null;
};

function createAgentPrisma(initial: SessionRow) {
  const sessions = new Map<string, SessionRow>([[initial.id, { ...initial }]]);
  const transcripts: Array<Record<string, unknown>> = [];
  let tid = 0;
  return {
    _sessions: sessions,
    _transcripts: transcripts,
    agentSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = sessions.get(where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
        const row = sessions.get(where.id)!;
        const next = { ...row, ...data };
        sessions.set(where.id, next);
        return { ...next };
      }),
    },
    agentTranscript: {
      findFirst: vi.fn(async ({ where }: { where: { sessionId: string } }) => {
        const rows = transcripts
          .filter((t) => t['sessionId'] === where.sessionId)
          .sort((a, b) => (b['seq'] as number) - (a['seq'] as number));
        return rows[0] ? { seq: rows[0]['seq'] } : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `t-${++tid}`, ...data };
        transcripts.push(row);
        return { ...row };
      }),
    },
  };
}

const AGENT_SESSION: SessionRow = {
  id: 'sess-1',
  userId: 'owner-1',
  repoId: 'repo-1',
  instruction: 'do the task',
  status: 'RUNNING',
  branchRef: 'agent/sess-1',
  maxIterations: 5,
  iterationCount: 0,
  costBudget: 100,
  costSpent: 0,
  linkedPrId: null,
};

function loopThatActs(obs: Observation): ToolExecutionLoop {
  return {
    selectTool: vi.fn(() => ({ toolName: 'edit_file', args: {} })),
    execute: vi.fn(async () => obs),
  };
}

describe('Agent Runtime — ownership filter denies unauthorized tool actions (Req 22.1/22.2)', () => {
  it('DENIES a cross-owner step: fails closed with 403, marks the session FAILED, audits the rejection', async () => {
    const prisma = createAgentPrisma(AGENT_SESSION);
    // The repo is owned by a DIFFERENT user than the session principal.
    const resourceOwnership: ResourceOwnershipPort = {
      resolveRepoOwner: vi.fn(async () => ({ ownerId: 'someone-else' })),
    };
    const runtime = new AgentRuntime(prisma as never, {
      loop: loopThatActs({ ok: true, mutatedBranch: 'agent/sess-1' }),
      resourceOwnership,
    });

    await expect(runtime.step('sess-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'OWNERSHIP_AUTHZ_DENIED',
    });

    const session = await prisma.agentSession.findUnique({ where: { id: 'sess-1' } });
    expect(session?.status).toBe('FAILED');
    // The rejection is auditable and no tool ran / counter advanced.
    expect(session?.iterationCount).toBe(0);
    expect(prisma._transcripts[0]).toMatchObject({
      role: 'OBSERVATION',
      payload: expect.objectContaining({ rejected: true, reason: 'ownership authorization denied' }),
    });
  });

  it('DENIES a cross-tenant step (different tenant, not a tenant admin) — fails closed', async () => {
    const prisma = createAgentPrisma(AGENT_SESSION);
    // Same NOT-owner, in a different tenant; the default principal is not a
    // tenant admin, so the same-tenant-admin allowance does not apply.
    const resourceOwnership: ResourceOwnershipPort = {
      resolveRepoOwner: vi.fn(async () => ({ ownerId: 'other-owner', tenantId: 'tenant-B' })),
    };
    const runtime = new AgentRuntime(prisma as never, {
      loop: loopThatActs({ ok: true, mutatedBranch: 'agent/sess-1' }),
      resourceOwnership,
    });

    await expect(runtime.step('sess-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'OWNERSHIP_AUTHZ_DENIED',
    });
    expect((await prisma.agentSession.findUnique({ where: { id: 'sess-1' } }))?.status).toBe('FAILED');
  });

  it('ALLOWS a step when the session principal owns the target resource', async () => {
    const prisma = createAgentPrisma(AGENT_SESSION);
    const resourceOwnership: ResourceOwnershipPort = {
      resolveRepoOwner: vi.fn(async () => ({ ownerId: 'owner-1' })), // == session.userId
    };
    const runtime = new AgentRuntime(prisma as never, {
      loop: loopThatActs({ ok: true, mutatedBranch: 'agent/sess-1', tokensUsed: 1 }),
      resourceOwnership,
    });

    const result = await runtime.step('sess-1');
    expect(result.outcome).toBe('executed');
    expect(result.session.status).toBe('RUNNING');
  });
});

// ---------------------------------------------------------------------------
// 3. Spans emitted for delivery, agent steps, and retrieval (Req 23.2)
// ---------------------------------------------------------------------------

describe('Observability — spans emitted for delivery, agent steps, retrieval (Req 23.2)', () => {
  it('RETRIEVAL emits an answers.retrieve span with retrieval attributes', async () => {
    const tracer = new RecordingSpanPort();
    const corpus = [chunk('c-alice', 'alice', 'em-1')];
    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: new InMemoryVectorSearchPort([...corpus]),
      keywordStore: new InMemoryKeywordSearchPort([...corpus]),
      tracer,
    });

    await retriever.retrieve('alice', 'revenue', ['email'], 5);

    expect(tracer.names()).toContain('answers.retrieve');
    const span = tracer.withName('answers.retrieve')[0]!;
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({ code: 'ok' });
    expect(span.attributes).toMatchObject({ 'answers.user_id': 'alice', 'answers.k': 5 });
    expect(span.attributes).toHaveProperty('answers.result_count');
  });

  it('AGENT STEP emits an agent.step span with outcome + status attributes', async () => {
    const tracer = new RecordingSpanPort();
    const prisma = createAgentPrisma(AGENT_SESSION);
    const runtime = new AgentRuntime(prisma as never, {
      loop: loopThatActs({ ok: true, mutatedBranch: 'agent/sess-1' }),
      tracer,
    });

    await runtime.step('sess-1');

    expect(tracer.names()).toContain('agent.step');
    const span = tracer.withName('agent.step')[0]!;
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({ code: 'ok' });
    expect(span.attributes).toMatchObject({ 'agent.session_id': 'sess-1', 'agent.outcome': 'executed' });
  });

  it('AGENT STEP span ends `error` and records the error when the step throws', async () => {
    const tracer = new RecordingSpanPort();
    const prisma = createAgentPrisma(AGENT_SESSION);
    // Mutating off-branch fails closed (409 BRANCH_ISOLATION_VIOLATION).
    const runtime = new AgentRuntime(prisma as never, {
      loop: loopThatActs({ ok: true, mutatedBranch: 'main' }),
      tracer,
    });

    await expect(runtime.step('sess-1')).rejects.toMatchObject({ code: 'BRANCH_ISOLATION_VIOLATION' });

    const span = tracer.withName('agent.step')[0]!;
    expect(span.status?.code).toBe('error');
    expect(span.errors.length).toBeGreaterThan(0);
  });

  it('OUTBOUND DELIVERY emits a delivery.enqueue_send span on a valid owned draft', async () => {
    const tracer = new RecordingSpanPort();
    const prisma = {
      email: {
        findUnique: vi.fn(async () => ({
          id: 'email-1',
          userId: 'user-A',
          isDraft: true,
          isSent: false,
          subject: 'hi',
          bodyHtml: '<p>hi</p>',
          bodyPlain: 'hi',
          toAddresses: ['bob@example.com'],
          ccAddresses: [],
          bccAddresses: [],
          deliveryStatus: null,
        })),
        update: vi.fn(async () => ({})),
      },
    };
    const queue = { add: vi.fn(async () => 'outbound-delivery:email-1') };
    const pipeline = new OutboundDeliveryPipeline(prisma as never, queue as never, tracer);

    await pipeline.enqueueSend('user-A', 'email-1');

    expect(tracer.names()).toContain('delivery.enqueue_send');
    const span = tracer.withName('delivery.enqueue_send')[0]!;
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({ code: 'ok' });
    expect(span.attributes).toMatchObject({
      'delivery.user_id': 'user-A',
      'delivery.email_id': 'email-1',
      'delivery.recipient_count': 1,
      'delivery.status': 'queued',
    });
  });

  it('OUTBOUND DELIVERY span ends `error` when a cross-owner enqueue is rejected', async () => {
    const tracer = new RecordingSpanPort();
    const prisma = {
      email: {
        findUnique: vi.fn(async () => ({ id: 'email-1', userId: 'user-A', isDraft: true, isSent: false })),
        update: vi.fn(),
      },
    };
    const queue = { add: vi.fn() };
    const pipeline = new OutboundDeliveryPipeline(prisma as never, queue as never, tracer);

    await expect(pipeline.enqueueSend('user-B', 'email-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const span = tracer.withName('delivery.enqueue_send')[0]!;
    expect(span.status?.code).toBe('error');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('INBOUND DELIVERY emits a delivery.ingest_inbound span on ingest', async () => {
    const tracer = new RecordingSpanPort();

    const auth = {
      verifyInbound: vi.fn(async () => ({
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
        aligned: true,
        details: {},
      })),
    };
    const prisma = {
      user: { findUnique: vi.fn(async () => ({ id: 'user-1' })) },
      emailFolder: { findFirst: vi.fn(async () => ({ id: 'folder-inbox-1' })) },
      email: { update: vi.fn(async () => ({})) },
    };
    const emailService = {
      receive: vi.fn(async () => ({ id: 'email-1', threadId: 'thread-1' })),
    };
    const threadService = { stitchInbound: vi.fn(async () => 'thread-1') };
    const indexer = { index: vi.fn(async () => undefined) };

    const adapter = new InboundIngestAdapter(prisma as never, auth as never, {
      email: emailService as never,
      thread: threadService as never,
      indexer,
      tracer,
    });

    const msg: InboundRawMessage = {
      from: 'news@example.com',
      to: ['alice@quantmail.test'],
      subject: 'hello',
      text: 'hi',
    };
    await adapter.ingest(msg);

    expect(tracer.names()).toContain('delivery.ingest_inbound');
    const span = tracer.withName('delivery.ingest_inbound')[0]!;
    expect(span.ended).toBe(true);
    expect(span.status).toEqual({ code: 'ok' });
    expect(span.attributes).toMatchObject({
      'delivery.direction': 'inbound',
      'delivery.quarantined': false,
      'delivery.indexed': true,
    });
  });
});
