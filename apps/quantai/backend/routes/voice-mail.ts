// ============================================================================
// QuantAI — Fastify Routes: Voice-to-Mail Workflow (QM-QUANTY-003)
//
//   POST /voice/mail/prepare → transcript -> entities -> recipient resolve ->
//                              risk -> draft -> restatement + held send plan
//   POST /voice/mail/verify   → authoritative sent-state read-back
//
// The prepare step NEVER sends. It returns a restatement for the user to
// review plus a Sentinel-held planId. The client confirms via the existing
// POST /agentic/confirm/:planId (tier-3 confirmation for external send).
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { ToolPlan } from '@quant/quant-tools';
import { getAgentGateway } from '../services/agent-gateway.service';
import {
  parseVoiceMailCommand,
  prepareVoiceMail,
  verifySentState,
  type ContactCandidate,
} from '../services/voice-mail-workflow.service';

const prepareSchema = z.object({
  transcript: z.string().min(1).max(2000),
  asrConfidence: z.number().min(0).max(1).nullable().optional(),
  userDomain: z.string().max(253).optional(),
});

const verifySchema = z.object({
  emailId: z.string().min(1).max(128),
});

function requireUserId(request: unknown): string {
  const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getUserJwt(request: unknown): string {
  const header = (request as { headers?: Record<string, unknown> }).headers?.['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  throw createAppError('Missing Bearer <redacted>', 401, 'UNAUTHORIZED');
}

interface GatewayCtx {
  userId: string;
  jwt: string;
  requestId: string;
}

/** Run a single tool through the gateway executor and return the raw result. */
async function runTool(
  toolId: string,
  params: Record<string, unknown>,
  ctx: GatewayCtx,
): Promise<unknown> {
  const gateway = getAgentGateway();
  const plan: ToolPlan = {
    id: `voicemail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    steps: [
      {
        stepId: 's1',
        toolId,
        params,
        dependsOn: [],
        outputKey: 'out',
      },
    ],
    estimatedCost: 'free',
    requiredPermission: 0,
    description: `voice-mail: ${toolId}`,
  };
  const [result] = await gateway.getExecutor().execute(plan, {
    userId: ctx.userId,
    sessionId: `voicemail-${Date.now()}`,
    permissions: 3,
    dryRun: false,
    metadata: { jwt: ctx.jwt, requestId: ctx.requestId },
  });
  if (!result?.success) {
    throw createAppError(result?.error ?? `Tool '${toolId}' failed`, 502, 'TOOL_FAILED');
  }
  return result.data;
}

function toContactCandidates(raw: unknown): ContactCandidate[] {
  const list = (raw as { data?: unknown })?.data ?? raw;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (c): c is Record<string, unknown> =>
        typeof c === 'object' && c !== null,
    )
    .map((c) => ({
      id: typeof c['id'] === 'string' ? c['id'] : undefined,
      name: String(c['name'] ?? c['displayName'] ?? ''),
      email: String(c['email'] ?? c['emailAddress'] ?? ''),
    }))
    .filter((c) => c.email || c.name);
}

export default async function voiceMailRoutes(fastify: FastifyInstance) {
  /**
   * POST /voice/mail/prepare — parse, resolve, draft, restate.
   * Returns the restatement + a Sentinel-held planId for the send step.
   * Nothing is sent by this endpoint.
   */
  fastify.post('/prepare', async (request, reply) => {
    const userId = requireUserId(request);
    const jwt = getUserJwt(request);
    const parsed = prepareSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const { transcript, asrConfidence, userDomain } = parsed.data;
    const requestId =
      (request.headers['x-request-id'] as string | undefined) ??
      `voicemail-prepare-${Date.now()}`;
    const ctx: GatewayCtx = { userId, jwt, requestId };

    // 1. Parse entities (pure logic, no I/O).
    const entities = parseVoiceMailCommand(transcript, asrConfidence ?? null);

    // 2. Resolve recipient via the contacts search tool.
    const query = entities.recipientEmail ?? entities.recipientName ?? '';
    let contacts: ContactCandidate[] = [];
    if (query) {
      const raw = await runTool('quantmail.contacts.search', { q: query }, ctx);
      contacts = toContactCandidates(raw);
    }

    // 3-5. Resolve, risk, restatement (pure logic).
    const prepared = prepareVoiceMail(transcript, asrConfidence ?? null, contacts, userDomain);

    if (!prepared.canProceed) {
      return reply.send({
        success: true,
        data: { ...prepared, draftId: null, planId: null, confirmationRequired: false },
      });
    }

    // 6. Create the draft (tier 0, no confirmation needed).
    const draftRaw = (await runTool(
      'quantmail.draft',
      {
        to: prepared.recipient.email ?? '',
        subject: prepared.entities.subject ?? '(no subject)',
        body: prepared.entities.body ?? '',
      },
      ctx,
    )) as { data?: { id?: string } } | null;
    const draftId =
      (draftRaw as unknown as { data?: { id?: string } })?.data?.id ??
      (draftRaw as unknown as { id?: string })?.id ??
      null;

    // 7. Build the send plan and hold it for Sentinel confirmation.
    //    quantmail.send is tier 3 -> checkPermissions always holds it.
    const gateway = getAgentGateway();
    const sendPlan: ToolPlan = {
      id: `voicemail-send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      steps: [
        {
          stepId: 'send1',
          toolId: 'quantmail.send',
          params: {
            to: prepared.recipient.email ?? '',
            subject: prepared.entities.subject ?? '(no subject)',
            body: prepared.entities.body ?? '',
          },
          dependsOn: [],
          outputKey: 'sendResult',
        },
      ],
      estimatedCost: 'free',
      requiredPermission: 3,
      description: `voice-mail send to ${prepared.restatement.to}`,
    };
    const gate = gateway.checkPermissions(sendPlan);
    let planId: string | null = null;
    if (gate.held) {
      gateway.bindHeldPlan(gate.planId, userId);
      planId = gate.planId;
    }

    return reply.send({
      success: true,
      data: {
        ...prepared,
        draftId,
        planId,
        confirmationRequired: planId !== null,
        confirmEndpoint: planId ? `/agentic/confirm/${planId}` : null,
      },
    });
  });

  /**
   * POST /voice/mail/verify — authoritative sent-state read-back.
   * Body: { emailId }. Returns the interpreted delivery state.
   */
  fastify.post('/verify', async (request, reply) => {
    const userId = requireUserId(request);
    const jwt = getUserJwt(request);
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const requestId =
      (request.headers['x-request-id'] as string | undefined) ??
      `voicemail-verify-${Date.now()}`;

    const raw = await runTool(
      'quantmail.email.get',
      { id: parsed.data.emailId },
      { userId, jwt, requestId },
    );
    const record = ((raw as { data?: unknown })?.data ?? raw) as {
      isSent?: unknown;
      deliveryStatus?: unknown;
    } | null;

    return reply.send({
      success: true,
      data: verifySentState(parsed.data.emailId, record),
    });
  });
}
