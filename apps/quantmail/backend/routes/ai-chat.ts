// ============================================================================
// QuantMail — QuantAI chat route (POST /ai/chat)
//
// Powers the "Ask QuantAI" copilot panel: a real multi-turn chat that is aware
// of what the user currently has on screen (route, selected thread, subject,
// visible text) so answers reference the actual workspace instead of guessing.
//
// Inference goes through the pluggable provider layer (services/ai-provider),
// so switching from Cloudflare Workers AI to an OpenAI-compatible endpoint or
// our own future model is a config change only — no code change here.
//
// `intent` is the settings page's "How much thinking" picker arriving at the
// only place that can act on it. It used to stop at `localStorage`: the page
// wrote `quant-ai-model-mode`, promised the value was "sent with each request as
// an intent", and this route hardcoded `{ maxTokens: 1024, temperature: 0.6 }`
// for every caller. The tier now decides the answer-length budget, the reasoning
// directive, the provider timeout and (when a deployment pins one) the model —
// and the resolved tier goes back in the response so the client can say which
// one actually ran instead of which one was asked for.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AI_INTENTS, measureAISignals, resolveAIIntent } from '@quant/common';
import {
  aiChat,
  isAIConfigured,
  activeProvider,
  resolveTierModel,
} from '../services/ai-provider.service';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(6000),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(24),
  // Optional so a client that predates this field still works: absent is `auto`,
  // which is also the picker's default.
  intent: z.enum(AI_INTENTS).optional(),
  context: z
    .object({
      app: z.string().max(200).optional(),
      route: z.string().max(500).optional(),
      view: z.string().max(2000).optional(),
      subject: z.string().max(1000).optional(),
      from: z.string().max(320).optional(),
      selection: z.string().max(4000).optional(),
      screenText: z.string().max(8000).optional(),
    })
    .optional(),
  tools: z
    .object({
      enabled: z.boolean().default(false),
      allow: z.array(z.string()).optional(),
      maxSteps: z.number().int().min(1).max(3).default(2),
    })
    .optional(),
});

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}

export interface ToolExecutionCard {
  toolName: string;
  callId: string;
  status: 'succeeded' | 'failed';
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
  durationMs: number;
}

const SYSTEM_PROMPT_PERSONA =
  'You are QuantAI (Quanty), the sovereign agentic operating AI built into the Quantrinity workspace (QuantMail: mail, calendar, contacts, drive, and QuantGit developer hub).';

// Memory honesty: the "On-screen context" system block describes what is
// visible on the user's screen right now (app, route, view). It is context,
// NEVER conversation history. The model once answered "what was the last thing
// I asked you?" with "You last asked me to provide a snapshot of your
// mailbox…" — fabricated from the context block, never asked. When the user
// asks about previous questions or requests, answer ONLY from the actual
// user/assistant messages in this conversation; never present on-screen context
// lines as things the user said, asked, or did.
const SYSTEM_PROMPT_CONTEXT_HONESTY = [
  'The "On-screen context" block below describes what is currently visible on screen — it is context, not conversation history.',
  'When asked what the user previously asked, said, or requested, use ONLY the actual user and assistant messages in this conversation.',
  'Never describe on-screen context (app name, route, view label) as something the user asked you for.',
].join(' ');

// Quanty sends email (user-approved 2026-10-10): the model drafts, the app
// confirms. The draft travels as an UNFENCED tool_call envelope — the backend
// dispatcher only scans fenced ```tool_call blocks, so this envelope never
// executes server-side. The chat client renders a confirmation card (full To /
// Subject / Body with Send / Edit / Cancel) and only the user's explicit Send
// tap transmits anything. This keeps the honesty contract intact: the model
// must never claim an email was sent, is sending, or will be sent.
const SYSTEM_PROMPT_SEND_EMAIL = [
  'When the user asks you to send or draft an email, compose the draft and emit it as an unfenced tool_call block on its own line:',
  'tool_call {"name": "send_email", "arguments": {"to": "<full email address>", "subject": "<subject>", "body": "<full body text>"}}',
  'Do NOT wrap it in code fences. Add one short prose line saying the draft is ready for their review.',
  'The app shows the user a confirmation card with the full recipient address, subject and body — the email is NOT sent until they tap Send.',
  'Never claim an email was sent, is sending, or will be sent.',
  'If the recipient is ambiguous, missing, or not a valid email address, do NOT emit the block — ask the user for the full email address instead.',
].join(' ');

// Prompt for requests where the tool dispatcher will actually run. The model
// is told to emit tool calls because a dispatcher is listening.
const SYSTEM_PROMPT = [
  SYSTEM_PROMPT_PERSONA,
  SYSTEM_PROMPT_CONTEXT_HONESTY,
  SYSTEM_PROMPT_SEND_EMAIL,
  'You have tools that perform real, authenticated actions in this workspace.',
  'When the user instructs you to build, create a repo, write code, or commit a file, you MUST execute the appropriate tool by emitting a JSON block formatted exactly as:',
  '```tool_call\n{\n  "name": "<tool_name>",\n  "arguments": { ... }\n}\n```',
  'Supported tools:',
  '1. create_repository: { "name": string, "description"?: string, "visibility"?: "public"|"private"|"internal", "initReadme"?: boolean }',
  '2. commit_file: { "repoId": string, "path": string, "content": string, "message": string, "branch"?: string, "parentSha": string | null }',
  '3. read_file_blob: { "repoId": string, "path": string, "ref"?: string }',
  'You can emit multiple tool calls sequentially for multi-step tasks.',
  'Never claim to have performed an action or created a resource that the tool did not explicitly return, and never claim a write succeeded before the dispatcher reports succeeded.',
  'Always include a concise, empowering summary in your response explaining what was created or executed.',
].join(' ');

// Prompt for requests where tool execution is disabled (the client did not
// enable tools, or the ENABLE_AUTONOMOUS_TOOLS kill switch is off — the
// QuantGit copilot client never enables tools). QM-UIUX-077: this used to be
// the tools prompt above, so the model emitted tool calls nobody executed and
// then announced the writes as done ("Repository … created in database!")
// while nothing was persisted. With no dispatcher listening, the model must
// not claim — or offer to perform — any write at all.
const SYSTEM_PROMPT_NO_TOOLS = [
  SYSTEM_PROMPT_PERSONA,
  SYSTEM_PROMPT_CONTEXT_HONESTY,
  SYSTEM_PROMPT_SEND_EMAIL,
  'In this chat you CANNOT create, modify, or delete anything: tool execution is disabled for this request, so nothing you describe will actually happen.',
  'Never claim that you created, updated, committed, deployed, or deleted a resource, and never announce a write as done or as about to happen.',
  'If the user asks you to create a repository or change code, say honestly that you cannot do it from this chat and point them to the app\u2019s own controls (for example the "New repository" button in QuantGit). You may still explain, plan, and draft content for the user to apply themselves.',
].join(' ');

async function executeAutonomousTool(
  fastify: FastifyInstance,
  userId: string,
  toolName: string,
  callId: string,
  args: Record<string, any>,
  request: any,
): Promise<ToolExecutionCard> {
  const startTime = Date.now();
  const prisma = getPrisma(fastify);

  try {
    if (toolName === 'create_repository') {
      const name = String(args.name || '').trim();
      if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name) || name.toLowerCase().endsWith('.git')) {
        throw new Error('Valid repository name is required (alphanumeric, dot, dash, underscore)');
      }

      let repo = await prisma.repository.findFirst({
        where: { ownerId: userId, name, deletedAt: null },
      });

      if (!repo) {
        repo = await prisma.repository.create({
          data: {
            ownerId: userId,
            name,
            description: args.description || null,
            visibility: (args.visibility || 'private').toUpperCase(),
            defaultBranch: 'main',
          },
        });

        if (fastify.repositoryProvisioning) {
          try {
            const res = await fastify.repositoryProvisioning.provision({
              owner: userId,
              name,
            });
            await prisma.repository.update({
              where: { id: repo.id },
              data: { storagePathUrl: res.storagePath },
            });
          } catch (provisionErr) {
            request.log.warn({ err: provisionErr }, 'Autonomous repo provisioning notice');
          }
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true, email: true },
      });

      if (args.initReadme && fastify.repositoryMutation) {
        try {
          const commit = await fastify.repositoryMutation.commitFile({
            owner: userId,
            name,
            branch: 'main',
            path: 'README.md',
            content: `# ${name}\n\n${args.description || 'Created autonomously by QuantAI.'}\n`,
            message: 'Initial commit: README.md',
            expectedHeadSha: null,
            author: {
              name: user?.displayName || user?.username || 'Quanty',
              email: user?.email || `${userId}@quantmail.in`,
            },
          });

          await prisma.branch.upsert({
            where: { repoId_name: { repoId: repo.id, name: 'main' } },
            update: { commitSha: commit.commitSha },
            create: { repoId: repo.id, name: 'main', commitSha: commit.commitSha },
          });
        } catch (readmeErr) {
          request.log.warn({ err: readmeErr }, 'Autonomous README commit notice');
        }
      }

      return {
        toolName,
        callId,
        status: 'succeeded',
        input: args,
        result: {
          id: repo.id,
          name: repo.name,
          fullName: `${user?.username || 'user'}/${repo.name}`,
          visibility: String(repo.visibility).toLowerCase(),
          defaultBranch: repo.defaultBranch || 'main',
        },
        durationMs: Date.now() - startTime,
      };
    }

    if (toolName === 'commit_file') {
      const repoIdentifier = String(args.repoId || '').trim();
      const filePath = String(args.path || '').trim();
      const content = String(args.content || '');
      const message = String(args.message || `chore: update ${filePath}`).trim();
      const targetBranch = String(args.branch || 'main').trim();
      const suppliedParentSha = args.parentSha;

      if (!repoIdentifier || !filePath) {
        throw new Error('Repository identifier and file path are required');
      }

      if (suppliedParentSha === undefined) {
        throw createAppError(
          'parentSha is required: provide 40-char SHA of current branch head or null for root commit',
          400,
          'PARENT_SHA_REQUIRED',
        );
      }

      if (
        suppliedParentSha !== null &&
        (typeof suppliedParentSha !== 'string' || !/^[0-9a-f]{40}$/i.test(suppliedParentSha))
      ) {
        throw createAppError(
          'parentSha must be a 40-character hexadecimal SHA or null',
          400,
          'INVALID_PARENT_SHA',
        );
      }

      const expectedHeadSha =
        typeof suppliedParentSha === 'string' ? suppliedParentSha.toLowerCase() : null;

      const repo = await prisma.repository.findFirst({
        where: {
          OR: [{ id: repoIdentifier }, { name: repoIdentifier }],
          ownerId: userId,
          deletedAt: null,
        },
      });

      if (!repo) {
        throw new Error(`Repository "${repoIdentifier}" not found`);
      }

      const branchRecord = await prisma.branch.findUnique({
        where: {
          repoId_name: {
            repoId: repo.id,
            name: targetBranch,
          },
        },
      });

      if (!branchRecord && targetBranch !== repo.defaultBranch) {
        throw createAppError('Branch not found', 404, 'BRANCH_NOT_FOUND');
      }

      if (branchRecord?.isProtected) {
        throw createAppError('Cannot commit to protected branch', 403, 'BRANCH_PROTECTED');
      }

      if (!fastify.repositoryMutation) {
        throw createAppError(
          'Repository mutation engine is not available on this instance',
          503,
          'STORAGE_UNAVAILABLE',
        );
      }

      const currentHeadSha = await fastify.repositoryMutation.getBranchHead({
        owner: repo.ownerId,
        name: repo.name,
        branch: targetBranch,
      });
      const normalizedCurrentHeadSha = currentHeadSha?.toLowerCase() ?? null;

      if (expectedHeadSha !== normalizedCurrentHeadSha) {
        throw createAppError(
          `The branch head changed. Current head is ${normalizedCurrentHeadSha ?? 'null'}`,
          409,
          'STALE_PARENT_SHA',
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true, email: true },
      });

      const commitResult = await fastify.repositoryMutation.commitFile({
        owner: repo.ownerId,
        name: repo.name,
        branch: targetBranch,
        path: filePath,
        content,
        message,
        expectedHeadSha,
        author: {
          name: user?.displayName || user?.username || 'Quanty',
          email: user?.email || `${userId}@quantmail.in`,
        },
      });

      await prisma.branch.upsert({
        where: { repoId_name: { repoId: repo.id, name: targetBranch } },
        update: { commitSha: commitResult.commitSha },
        create: { repoId: repo.id, name: targetBranch, commitSha: commitResult.commitSha },
      });

      return {
        toolName,
        callId,
        status: 'succeeded',
        input: args,
        result: {
          repoId: repo.id,
          repoName: repo.name,
          commitSha: commitResult.commitSha,
          blobSha: commitResult.blobSha,
          path: commitResult.path,
          branch: commitResult.branch,
          message,
        },
        durationMs: Date.now() - startTime,
      };
    }

    if (toolName === 'read_file_blob') {
      const repoIdentifier = String(args.repoId || '').trim();
      const filePath = String(args.path || '').trim();
      const ref = String(args.ref || 'main').trim();

      const repo = await prisma.repository.findFirst({
        where: {
          OR: [{ id: repoIdentifier }, { name: repoIdentifier }],
          ownerId: userId,
          deletedAt: null,
        },
      });

      if (!repo) throw new Error(`Repository "${repoIdentifier}" not found`);

      if (fastify.repositoryInspection) {
        const blob = await fastify.repositoryInspection.readBlob({
          owner: repo.ownerId,
          name: repo.name,
          ref,
          path: filePath,
        });

        return {
          toolName,
          callId,
          status: 'succeeded',
          input: args,
          result: {
            repoId: repo.id,
            path: blob.path,
            content: blob.content,
            size: blob.size,
            sha: blob.sha,
          },
          durationMs: Date.now() - startTime,
        };
      }

      throw new Error('Repository inspection service unavailable');
    }

    if (toolName === 'deploy_agent') {
      const repoIdentifier = String(args.repoId || '').trim();

      const repo = await prisma.repository.findFirst({
        where: {
          OR: [{ id: repoIdentifier }, { name: repoIdentifier }],
          ownerId: userId,
          deletedAt: null,
        },
      });

      if (!repo) throw new Error(`Repository "${repoIdentifier}" not found`);

      return {
        toolName,
        callId,
        status: 'failed',
        input: args,
        error: {
          code: 'HELD_PENDING_PERSISTENCE',
          message:
            'deploy_agent is held pending durable AgentSession persistence and runtime task handoff',
        },
        durationMs: Date.now() - startTime,
      };
    }

    throw new Error(`Unknown tool "${toolName}"`);
  } catch (error: any) {
    return {
      toolName,
      callId,
      status: 'failed',
      input: args,
      error: {
        code: error.code || 'EXECUTION_FAILED',
        message: error.message || 'Tool execution failed',
      },
      durationMs: Date.now() - startTime,
    };
  }
}

function buildContextBlock(context: z.infer<typeof chatSchema>['context']): string {
  if (!context) return '';
  const lines: string[] = [];
  if (context.app) lines.push(`App: ${context.app}`);
  if (context.route) lines.push(`Route: ${context.route}`);
  if (context.view) lines.push(`View: ${context.view}`);
  if (context.from) lines.push(`Open message from: ${context.from}`);
  if (context.subject) lines.push(`Open subject: ${context.subject}`);
  if (context.selection) lines.push(`User selection:\n${context.selection}`);
  if (context.screenText) lines.push(`Visible screen text:\n${context.screenText}`);
  if (lines.length === 0) return '';
  return `On-screen context:\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Mailbox grounding (bug 4, 2026-10-04).
//
// "Summarize my inbox" used to reach the model with NO mailbox data at all —
// only the persona prompt and whatever text happened to be on screen — so the
// model invented numbers ("5 unread emails and 17 total messages") for a
// mailbox that actually held 1 conversation and 0 unread. Nothing in the
// codebase hardcodes those numbers; they are pure LLM hallucination from an
// ungrounded prompt.
//
// The fix: read the real message store on every chat request — the same
// `email` rows the inbox list reads, with the same default-inbox scoping as
// `GET /emails` in routes/emails.ts — and hand the numbers to the model as an
// explicit system block with a strict use-only-what-is-provided rule. If the
// read fails (no prisma, DB down), the model is told to admit it could not
// load mailbox data instead of guessing. The rule is absolute: real data or an
// honest empty/error state, never fabricated counts.
// ---------------------------------------------------------------------------

const MAILBOX_SNAPSHOT_LIMIT = 6;

interface MailboxSnapshotMessage {
  from: string;
  subject: string;
  unread: boolean;
  receivedAt: string;
}

interface MailboxSnapshot {
  available: boolean;
  total: number;
  unread: number;
  recent: MailboxSnapshotMessage[];
}

function formatSnapshotSender(fromName: unknown, fromAddress: unknown): string {
  const name = typeof fromName === 'string' ? fromName.trim() : '';
  const address = typeof fromAddress === 'string' ? fromAddress.trim() : '';
  if (name && address) return `${name} <${address}>`;
  return name || address || '(unknown sender)';
}

async function readMailboxSnapshot(prisma: any, userId: string): Promise<MailboxSnapshot> {
  const empty: MailboxSnapshot = { available: false, total: 0, unread: 0, recent: [] };
  if (!prisma?.email?.count || typeof prisma.email.findMany !== 'function') return empty;
  try {
    // Same core scoping as the default inbox in routes/emails.ts: this user's
    // mail, not deleted, and not in draft/spam/trash. Snooze/archive-folder
    // refinements are deliberately left out — this snapshot answers "my inbox"
    // as the app badge does, not as one filtered tab does.
    const where = { userId, deletedAt: null, isDraft: false, isSpam: false, isTrash: false };
    const [total, unread, recent] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.count({ where: { ...where, isRead: false } }),
      prisma.email.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
        take: MAILBOX_SNAPSHOT_LIMIT,
        select: {
          fromName: true,
          fromAddress: true,
          subject: true,
          isRead: true,
          receivedAt: true,
        },
      }),
    ]);
    return {
      available: true,
      total: typeof total === 'number' ? total : 0,
      unread: typeof unread === 'number' ? unread : 0,
      recent: (Array.isArray(recent) ? recent : []).map((m: any) => ({
        from: formatSnapshotSender(m?.fromName, m?.fromAddress),
        subject:
          typeof m?.subject === 'string' && m.subject.trim().length > 0
            ? m.subject.trim()
            : '(no subject)',
        unread: m?.isRead === false,
        receivedAt: m?.receivedAt ? new Date(m.receivedAt).toISOString() : '(unknown date)',
      })),
    };
  } catch {
    // A snapshot read must never fail the chat turn: the model gets the honest
    // "unavailable" block instead, and says so to the user.
    return empty;
  }
}

function buildMailboxSystemBlock(snapshot: MailboxSnapshot): string {
  if (!snapshot.available) {
    return [
      'Mailbox data unavailable: the live mailbox could not be read for this request.',
      'If the user asks about their inbox, mail, messages, unread counts, or message contents,',
      'say honestly that you could not load their mailbox data right now.',
      'NEVER invent counts, senders, subjects, dates, or message content.',
    ].join(' ');
  }
  const lines = [
    "LIVE MAILBOX SNAPSHOT — authoritative, read from the user's real mailbox just now. Treat every number and name below as ground truth:",
    `Inbox: ${snapshot.total} total message(s), ${snapshot.unread} unread.`,
  ];
  if (snapshot.recent.length > 0) {
    lines.push('Most recent messages (newest first):');
    snapshot.recent.forEach((m, i) => {
      lines.push(
        `${i + 1}. [${m.unread ? 'UNREAD' : 'read'}] From: ${m.from} — Subject: ${m.subject} — ${m.receivedAt}`,
      );
    });
  } else {
    lines.push('The inbox is currently empty — there are no messages to list.');
  }
  // PAUD-P0-7 (QM-UIUX-080, 2026-10-09): the scoping used to say "if they ask
  // about something not in the snapshot, say you do not have that information
  // rather than guessing" with no qualification at all. The model read that as
  // a universal refusal rule — "what is 2+2" is not in the snapshot, so it
  // answered "I don't have that information." on BOTH the Fast and Deep tiers,
  // making the assistant useless for any non-mailbox question. The grounding
  // is an anti-hallucination guard for MAILBOX questions only; a general
  // question (math, general knowledge, writing help) must be answered from the
  // model's own knowledge with no reference to this snapshot.
  lines.push(
    'RULES — SCOPE: these rules apply ONLY when the user is asking about their inbox, mail, messages, or unread counts. ' +
      'For such mailbox questions, answer ONLY from this snapshot and quote its numbers exactly. ' +
      'Never invent counts, senders, subjects, dates, or content not listed here. ' +
      'If a mailbox question asks about something not in the snapshot, say you do not have that information rather than guessing. ' +
      'For ANY question that is NOT about the mailbox — general knowledge, calculations like "what is 2+2", writing help, anything else — ' +
      'answer normally from your own knowledge; this snapshot does not constrain those answers and must never be a reason to refuse one.',
  );
  return lines.join('\n');
}

export default async function aiChatRoutes(fastify: FastifyInstance) {
  fastify.get('/chat/health', async (_request, reply) => {
    if (!isAIConfigured()) {
      return reply.status(503).send({
        success: false,
        data: { status: 'offline' },
        error: { code: 'AI_UNAVAILABLE', message: 'QuantAI is not configured on this environment' },
      });
    }

    return reply.send({ success: true, data: { status: 'ready', provider: activeProvider() } });
  });

  fastify.post('/chat', async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const { messages, context, intent, tools } = parsed.data;
    const contextBlock = buildContextBlock(context);

    // Ground every turn in the real mailbox (bug 4): without this the model
    // answers "Summarize my inbox" from nothing and fabricates the numbers.
    const mailboxSnapshot = await readMailboxSnapshot(getPrisma(fastify), userId);
    const mailboxBlock = buildMailboxSystemBlock(mailboxSnapshot);

    // `auto` decides from the size and depth of what actually arrived, not from
    // anything the client asserts about itself.
    const plan = resolveAIIntent(intent, measureAISignals(messages, context));

    // Decided before the prompt is composed: the model is only told it has
    // tools when a dispatcher will actually execute them (QM-UIUX-077).
    const isToolCallingEnabled =
      tools?.enabled === true && process.env.ENABLE_AUTONOMOUS_TOOLS === 'true';

    const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: isToolCallingEnabled ? SYSTEM_PROMPT : SYSTEM_PROMPT_NO_TOOLS },
      { role: 'system', content: plan.directive },
    ];
    if (contextBlock) {
      modelMessages.push({ role: 'system', content: contextBlock });
    }
    // Always present: the grounding block is the anti-hallucination guard, and
    // the "unavailable" variant is the honest state when the store cannot be
    // read — never a fabricated count.
    modelMessages.push({ role: 'system', content: mailboxBlock });
    modelMessages.push(...messages);

    if (!isAIConfigured()) {
      throw createAppError('QuantAI is not configured on this environment', 503, 'AI_UNAVAILABLE');
    }

    try {
      const rawMessage = await aiChat(modelMessages, {
        maxTokens: plan.maxTokens,
        timeoutMs: plan.timeoutMs,
        model: resolveTierModel(plan.modelEnvVar),
      });

      // Autonomous Tool Calling Dispatcher:
      // Scan for ```tool_call blocks emitted by the model
      const toolExecutions: ToolExecutionCard[] = [];

      const toolCallRegex = /```(?:tool_call|json:tool_call)\s*([\s\S]*?)```/g;

      // Count every block the model emitted, executed or not. A block that
      // never produces an execution card — tooling disabled, over the
      // per-reply step limit, or unparseable — must be disclosed to the user
      // below: the model's prose may claim the write happened (QM-UIUX-077),
      // and silently stripping the block would present that claim as fact.
      const emittedToolCallCount = (rawMessage.match(toolCallRegex) ?? []).length;
      toolCallRegex.lastIndex = 0;

      if (isToolCallingEnabled) {
        const maxSteps = tools?.maxSteps ?? 2;
        const allowedTools = tools?.allow ? new Set(tools.allow) : null;
        let match: RegExpExecArray | null;

        while ((match = toolCallRegex.exec(rawMessage)) !== null) {
          if (toolExecutions.length >= maxSteps) {
            break;
          }
          try {
            const parsedCall = JSON.parse(match[1].trim());
            if (parsedCall?.name && parsedCall?.arguments) {
              if (allowedTools && !allowedTools.has(parsedCall.name)) {
                toolExecutions.push({
                  toolName: parsedCall.name,
                  callId: `call_${Date.now()}_${toolExecutions.length}`,
                  status: 'failed',
                  input: parsedCall.arguments,
                  error: {
                    code: 'TOOL_NOT_ALLOWED',
                    message: `Tool '${parsedCall.name}' is not in the allowed tools list`,
                  },
                  durationMs: 0,
                });
                continue;
              }

              const card = await executeAutonomousTool(
                fastify,
                userId,
                parsedCall.name,
                `call_${Date.now()}_${toolExecutions.length}`,
                parsedCall.arguments,
                request,
              );
              toolExecutions.push(card);
            }
          } catch (callParseErr) {
            request.log.warn({ err: callParseErr }, 'Failed to parse model tool call block');
          }
        }
      }

      // Clean tool call code blocks from user-visible response text
      const failedTools = toolExecutions.filter((t) => t.status === 'failed');
      let cleanMessage = rawMessage.replace(toolCallRegex, '').trim();

      const notices: string[] = [];
      if (failedTools.length > 0) {
        notices.push(
          failedTools
            .map((t) => `${t.toolName}: ${t.error?.message || 'Execution failed'}`)
            .join('; '),
        );
      }
      const unexecutedToolCalls = emittedToolCallCount - toolExecutions.length;
      if (unexecutedToolCalls > 0) {
        // The model proposed action(s) that never ran — because tooling is
        // disabled for this chat (the QuantGit copilot never enables it), the
        // step limit was hit, or a block could not be parsed. Say so plainly
        // at the top of the reply: whatever the prose below claims, nothing
        // was created, changed, or deleted by those proposals (QM-UIUX-077).
        notices.push(
          `${unexecutedToolCalls} proposed action(s) were NOT executed — nothing was created, changed, or deleted by them`,
        );
      }

      if (notices.length > 0) {
        const noticeText = `[Action Notice: ${notices.join('; ')}]`;
        cleanMessage = cleanMessage ? `${noticeText}\n\n${cleanMessage}` : noticeText;
      } else if (!cleanMessage && toolExecutions.length > 0) {
        cleanMessage = `Executed ${toolExecutions.length} autonomous action(s) successfully.`;
      }

      return reply.send({
        success: true,
        data: {
          message: cleanMessage,
          tier: plan.tier,
          routed: plan.routed,
          toolExecutions,
        },
      });
    } catch (err) {
      request.log.error({ err, tier: plan.tier }, 'QuantAI chat failed');
      throw createAppError('QuantAI could not answer right now', 503, 'AI_UNAVAILABLE');
    }
  });
}
