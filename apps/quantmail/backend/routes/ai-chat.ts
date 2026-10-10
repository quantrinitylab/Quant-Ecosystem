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
// Tool dispatch is native function calling (Phase 0): the tool table below is
// the single source of truth — the provider's function definitions, the system
// prompt's tool list, and the dispatcher's allow-list are all derived from it.
// Read-only tools (permissionTier 0) execute directly in the chat turn;
// anything that creates or changes state (tier >= 2) is NEVER executed by the
// model call itself — it becomes a confirmation card and runs only after the
// user's explicit approval via POST /ai/chat/confirm. There is no
// auto-approval anywhere on this path.
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
  aiChatWithTools,
  isAIConfigured,
  activeProvider,
  resolveTierModel,
} from '../services/ai-provider.service';
import type { AIToolCall, AIToolFunction } from '../services/ai-provider.service';
import {
  consumePendingConfirmation,
  createPendingConfirmation,
  peekPendingConfirmation,
} from '../services/ai-chat-tool-confirmations';

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

const confirmSchema = z.object({
  confirmationId: z.string().min(1).max(100),
  approved: z.boolean(),
});

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}

export interface ToolExecutionCard {
  toolName: string;
  callId: string;
  /** `pending-confirmation`: the call was NOT executed — it is waiting on the
   * user's explicit approval (see `confirmationId` / POST /ai/chat/confirm). */
  status: 'succeeded' | 'failed' | 'pending-confirmation';
  /**
   * Short human label for the visible agent timeline, e.g.
   * `Created repository "demo"` / `Create repository "demo" (private)` for a
   * pending proposal / `Attempted "deploy_agent"` for a failed call. Every
   * card the route emits must carry one — the chat client renders it verbatim
   * as the step's title (§9 "Live Visible Agent Mode").
   */
  label: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
  durationMs: number;
  /** Present when status === 'pending-confirmation'. */
  confirmationId?: string;
}

/**
 * Generic confirmation card (the PR #784 pattern, generalized): the model
 * proposed a state-changing action, the backend did not run it, and the user
 * decides. The client renders this with Confirm / Cancel and resolves it via
 * POST /ai/chat/confirm.
 */
export interface ToolConfirmationCard {
  id: string;
  toolName: string;
  title: string;
  summary: string;
  args: Record<string, unknown>;
  expiresAt: string;
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

// ---------------------------------------------------------------------------
// Native tool table — the single source of truth for ai-chat tool calling.
//
// The provider's native function definitions, the system prompt's "Supported
// tools" list, and the dispatcher's allow-list are ALL derived from this
// table — a schema is written once, never hand-duplicated across the prompt,
// the provider payload, and the dispatcher.
//
// Field shapes mirror @quant/quant-tools' ToolDefinition (name, description,
// parameters as JSON Schema, permissionTier) so the read-only mail tools can
// be appended here later without a second schema language.
//
// permissionTier: 0 = read-only, executes directly in the chat turn;
// >= 2 = creates/changes state, NEVER executed by the model call itself —
// the call becomes a confirmation card and runs only after the user's
// explicit approval via POST /ai/chat/confirm. There is no auto-approval.
// wired: false = no real handler exists yet; the tool is hidden from the
// model and any call fails honestly with NOT_WIRED ("not wired yet").
// ---------------------------------------------------------------------------
interface AiChatToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  permissionTier: 0 | 1 | 2 | 3 | 4;
  wired: boolean;
  notWiredReason?: string;
  /** Short human label for the confirmation card. */
  confirmTitle?: string;
}

const AI_CHAT_TOOL_DEFINITIONS: AiChatToolDefinition[] = [
  {
    name: 'create_repository',
    description: 'Create a new repository in the workspace. Returns the created repository record.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Repository name (alphanumeric, dot, dash, underscore; must not end with .git)',
        },
        description: { type: 'string', description: 'Optional repository description' },
        visibility: {
          type: 'string',
          enum: ['public', 'private', 'internal'],
          description: 'Repository visibility (default private)',
        },
        initReadme: {
          type: 'boolean',
          description: 'Create an initial README.md commit (default false)',
        },
      },
      required: ['name'],
    },
    permissionTier: 2,
    wired: true,
    confirmTitle: 'Create repository',
  },
  {
    name: 'commit_file',
    description:
      'Commit a file to a repository branch with strict compare-and-swap on the branch head.',
    parameters: {
      type: 'object',
      properties: {
        repoId: { type: 'string', description: 'Repository id or name' },
        path: { type: 'string', description: 'File path inside the repository' },
        content: { type: 'string', description: 'Full file content to write' },
        message: { type: 'string', description: 'Commit message' },
        branch: { type: 'string', description: 'Target branch (default main)' },
        parentSha: {
          type: ['string', 'null'],
          description: '40-char SHA of the current branch head, or null for a root commit. Required.',
        },
      },
      required: ['repoId', 'path', 'content', 'message', 'parentSha'],
    },
    permissionTier: 2,
    wired: true,
    confirmTitle: 'Commit file',
  },
  {
    name: 'read_file_blob',
    description: 'Read a file blob from a repository at a given ref.',
    parameters: {
      type: 'object',
      properties: {
        repoId: { type: 'string', description: 'Repository id or name' },
        path: { type: 'string', description: 'File path inside the repository' },
        ref: { type: 'string', description: 'Branch, tag or SHA (default main)' },
      },
      required: ['repoId', 'path'],
    },
    permissionTier: 0,
    wired: true,
  },
  {
    name: 'deploy_agent',
    description: 'Deploy an autonomous agent to a repository workstation.',
    parameters: {
      type: 'object',
      properties: {
        repoId: { type: 'string', description: 'Repository id or name' },
      },
      required: ['repoId'],
    },
    permissionTier: 3,
    wired: false,
    notWiredReason:
      'Agent deployment is not wired up yet — it is waiting on durable agent-session persistence (Phase 2).',
  },
];

function wiredToolDefinitions(): AiChatToolDefinition[] {
  return AI_CHAT_TOOL_DEFINITIONS.filter((d) => d.wired);
}

function findToolDefinition(name: string): AiChatToolDefinition | undefined {
  return AI_CHAT_TOOL_DEFINITIONS.find((d) => d.name === name);
}

/** Provider-native function definitions, derived from the table — never hand-duplicated. */
function toProviderToolFunctions(): AIToolFunction[] {
  return wiredToolDefinitions().map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    },
  }));
}

/** Compact one-line signature per wired tool, derived from the same table. */
function buildSupportedToolsPromptLines(): string[] {
  return wiredToolDefinitions().map((d, i) => {
    const sig = Object.entries(d.parameters.properties)
      .map(([key, schema]) => {
        const optional = d.parameters.required.includes(key) ? '' : '?';
        const rawType = (schema as { type?: unknown }).type;
        const type = Array.isArray(rawType) ? rawType.join(' | ') : String(rawType ?? 'unknown');
        return `"${key}"${optional}: ${type}`;
      })
      .join(', ');
    const gate = d.permissionTier >= 2 ? ' [needs your confirmation]' : '';
    return `${i + 1}. ${d.name}: { ${sig} }${gate} — ${d.description}`;
  });
}

// Prompt for requests where the tool dispatcher will actually run. The model
// is told to use the provided native function-calling tools — it must never
// emit tool calls as text (the old ```tool_call fenced-block hack is gone).
const SYSTEM_PROMPT = [
  SYSTEM_PROMPT_PERSONA,
  SYSTEM_PROMPT_CONTEXT_HONESTY,
  SYSTEM_PROMPT_SEND_EMAIL,
  'You have tools that perform real, authenticated actions in this workspace.',
  'When the user instructs you to build, create a repo, write code, or commit a file, you MUST execute the appropriate tool by calling the provided function with its arguments — never describe or emit a tool call as text or as a code block.',
  'Confirmation rule: tools marked [needs your confirmation] are NEVER executed by your call alone — calling one shows the user a confirmation card first. Describe exactly what the call will do, then WAIT for their approval. Never claim the action completed until the user approves it.',
  'Not yet available: deploy_agent (agent deployment is not wired up yet). If the user asks for it, say honestly that it is not wired yet — never attempt the call and never claim it worked.',
  'Supported tools:',
  ...buildSupportedToolsPromptLines(),
  'You can call multiple tools in one turn for multi-step tasks.',
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
        label: describeExecutedAction(toolName, args),
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
        label: describeExecutedAction(toolName, args),
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
          label: describeExecutedAction(toolName, args),
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

    // NOTE: only wired tools reach this dispatcher — unwired tools (e.g.
    // deploy_agent) are rejected with NOT_WIRED before dispatch, and
    // confirmation-gated tools (tier >= 2) arrive here only after the user
    // approved them via POST /ai/chat/confirm.

    throw new Error(`Unknown tool "${toolName}"`);
  } catch (error: any) {
    const failedDef = findToolDefinition(toolName);
    return {
      toolName,
      callId,
      status: 'failed',
      // The label names what was ATTEMPTED — the error icon + message below
      // carry the failure, so the timeline never reads as a success.
      label: failedDef
        ? `Attempted: ${describePlannedAction(failedDef, args)}`
        : `Attempted "${toolName}"`,
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

/** Human-readable "what will happen" line for a confirmation card. */
function describePlannedAction(
  def: AiChatToolDefinition,
  args: Record<string, unknown>,
): string {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (def.name === 'create_repository') {
    const visibility = str(args.visibility) || 'private';
    return `Create repository "${str(args.name) || '(unnamed)'}" (${visibility})`;
  }
  if (def.name === 'commit_file') {
    const branch = str(args.branch) || 'main';
    return `Commit "${str(args.path) || '(no path)'}" to ${str(args.repoId) || '(unknown repo)'} (${branch})`;
  }
  return `Run ${def.name}`;
}

/**
 * Past-tense human label for a card whose tool actually ran (§9 visible
 * agent timeline). The failed-call equivalent is the attempted action:
 * callers pair `describePlannedAction` with `Attempted "…"` so the label
 * always names what the agent tried, never claims it succeeded.
 */
function describeExecutedAction(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (toolName === 'create_repository') {
    return `Created repository "${str(args.name) || '(unnamed)'}"`;
  }
  if (toolName === 'commit_file') {
    const branch = str(args.branch) || 'main';
    return `Committed "${str(args.path) || '(no path)'}" to ${str(args.repoId) || '(unknown repo)'} (${branch})`;
  }
  if (toolName === 'read_file_blob') {
    const ref = str(args.ref) || 'main';
    return `Read "${str(args.path) || '(no path)'}" from ${str(args.repoId) || '(unknown repo)'} (${ref})`;
  }
  return `Ran ${toolName}`;
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
      // Native function calling: when tools are enabled the definitions ride
      // the provider's `tools` parameter and the requested calls come back
      // structured — no text parsing. When disabled, the plain chat path is
      // used so the model never sees tool definitions at all (QM-UIUX-077).
      const completion = isToolCallingEnabled
        ? await aiChatWithTools(modelMessages, {
            maxTokens: plan.maxTokens,
            timeoutMs: plan.timeoutMs,
            model: resolveTierModel(plan.modelEnvVar),
            // Derived from the tool table above — never hand-duplicated.
            tools: toProviderToolFunctions(),
          })
        : {
            content: await aiChat(modelMessages, {
              maxTokens: plan.maxTokens,
              timeoutMs: plan.timeoutMs,
              model: resolveTierModel(plan.modelEnvVar),
            }),
            toolCalls: [] as AIToolCall[],
          };
      const rawMessage = completion.content;
      const nativeToolCalls = completion.toolCalls;

      // Autonomous Tool Calling Dispatcher (native tool calls).
      const toolExecutions: ToolExecutionCard[] = [];
      const confirmationCards: ToolConfirmationCard[] = [];

      // Legacy ```tool_call fenced blocks must never reach the user or the
      // dispatcher: with native calling the model is instructed never to emit
      // them, and any that appear anyway are stripped. Counted as proposed
      // but unexecuted below, so the honesty notice still fires (QM-UIUX-077).
      const toolCallRegex = /```(?:tool_call|json:tool_call)\s*([\s\S]*?)```/g;
      const legacyBlockCount = (rawMessage.match(toolCallRegex) ?? []).length;

      if (isToolCallingEnabled) {
        const maxSteps = tools?.maxSteps ?? 2;
        const allowedTools = tools?.allow ? new Set(tools.allow) : null;

        for (const toolCall of nativeToolCalls) {
          if (toolExecutions.length >= maxSteps) {
            break;
          }
          const callId =
            toolCall.id && toolCall.id.length > 0
              ? toolCall.id
              : `call_${Date.now()}_${toolExecutions.length}`;
          if (!toolCall.name) {
            // Nameless calls cannot dispatch; they count as unexecuted below.
            continue;
          }
          if (allowedTools && !allowedTools.has(toolCall.name)) {
            toolExecutions.push({
              toolName: toolCall.name,
              callId,
              status: 'failed',
              label: `Attempted "${toolCall.name}"`,
              input: toolCall.arguments,
              error: {
                code: 'TOOL_NOT_ALLOWED',
                // §9 honest unwired state: a plain "not wired up" statement the
                // chat client can show verbatim — no hallucination, no claim
                // the action ran.
                message: `"${toolCall.name}" is not wired up for this chat — nothing was run.`,
              },
              durationMs: 0,
            });
            continue;
          }

          const def = findToolDefinition(toolCall.name);
          if (!def) {
            toolExecutions.push({
              toolName: toolCall.name,
              callId,
              status: 'failed',
              label: `Attempted "${toolCall.name}"`,
              input: toolCall.arguments,
              error: {
                code: 'UNKNOWN_TOOL',
                message: `"${toolCall.name}" is not wired yet — nothing was run.`,
              },
              durationMs: 0,
            });
            continue;
          }

          if (!def.wired) {
            // Honest capability surfacing: the tool has no real handler, so
            // the agent says "not wired yet" — it never fakes a result.
            toolExecutions.push({
              toolName: def.name,
              callId,
              status: 'failed',
              label: `Attempted "${def.name}"`,
              input: toolCall.arguments,
              error: {
                code: 'NOT_WIRED',
                message: `${def.name} is not wired yet${
                  def.notWiredReason ? ` — ${def.notWiredReason}` : ''
                } — nothing was run.`,
              },
              durationMs: 0,
            });
            continue;
          }

          if (def.permissionTier >= 2) {
            // Confirmation gate: a state-changing call is NEVER executed from
            // the chat turn itself. It becomes a confirmation card; the action
            // runs only after the user's explicit approval via
            // POST /ai/chat/confirm. There is no auto-approval on this path.
            const args = toolCall.arguments as Record<string, unknown>;
            const pending = createPendingConfirmation({
              userId,
              toolName: def.name,
              callId,
              args,
            });
            toolExecutions.push({
              toolName: def.name,
              callId,
              status: 'pending-confirmation',
              label: describePlannedAction(def, args),
              input: args,
              confirmationId: pending.id,
              durationMs: 0,
            });
            confirmationCards.push({
              id: pending.id,
              toolName: def.name,
              title: def.confirmTitle ?? def.name,
              summary: describePlannedAction(def, args),
              args,
              expiresAt: new Date(pending.expiresAt).toISOString(),
            });
            continue;
          }

          const card = await executeAutonomousTool(
            fastify,
            userId,
            toolCall.name,
            callId,
            toolCall.arguments as Record<string, any>,
            request,
          );
          toolExecutions.push(card);
        }
      }

      // Clean legacy tool-call code blocks from user-visible response text
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
      // Every call the model requested that never produced an execution card —
      // over the per-reply step limit, disallowed, or a legacy fenced block —
      // must be disclosed: the model's prose may claim the write happened
      // (QM-UIUX-077), and silently dropping the call would present that claim
      // as fact.
      const unexecutedToolCalls =
        nativeToolCalls.length - toolExecutions.length + legacyBlockCount;
      if (unexecutedToolCalls > 0) {
        // The model proposed action(s) that never ran — because tooling is
        // disabled for this chat (the QuantGit copilot never enables it), the
        // step limit was hit, or a legacy block was stripped. Say so plainly
        // at the top of the reply: whatever the prose below claims, nothing
        // was created, changed, or deleted by those proposals (QM-UIUX-077).
        notices.push(
          `${unexecutedToolCalls} proposed action(s) were NOT executed — nothing was created, changed, or deleted by them`,
        );
      }
      const pendingTools = toolExecutions.filter((t) => t.status === 'pending-confirmation');
      if (pendingTools.length > 0) {
        // Awaiting-confirmation calls are disclosed like any unexecuted
        // proposal: whatever the prose claims, nothing has run yet.
        notices.push(
          `${pendingTools.length} action(s) awaiting your confirmation — nothing has been created, changed, or deleted yet`,
        );
      }

      if (notices.length > 0) {
        const noticeText = `[Action Notice: ${notices.join('; ')}]`;
        cleanMessage = cleanMessage ? `${noticeText}\n\n${cleanMessage}` : noticeText;
      } else if (!cleanMessage && toolExecutions.length > 0) {
        cleanMessage =
          pendingTools.length > 0
            ? `${pendingTools.length} action(s) awaiting your confirmation — nothing has run yet.`
            : `Executed ${toolExecutions.length} autonomous action(s) successfully.`;
      }

      return reply.send({
        success: true,
        data: {
          message: cleanMessage,
          tier: plan.tier,
          routed: plan.routed,
          toolExecutions,
          confirmationCards,
        },
      });
    } catch (err) {
      request.log.error({ err, tier: plan.tier }, 'QuantAI chat failed');
      throw createAppError('QuantAI could not answer right now', 503, 'AI_UNAVAILABLE');
    }
  });

  // Resolve a confirmation card: the second half of the generic
  // confirmation-card pattern (propose -> card -> explicit user confirm ->
  // execute). The pending record is single-use and userId-scoped: it is
  // consumed exactly once, so a retried approval can never double-execute.
  fastify.post('/chat/confirm', async (request, reply) => {
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const { confirmationId, approved } = parsed.data;

    const pending = peekPendingConfirmation(confirmationId);
    if (!pending || Date.now() > pending.expiresAt) {
      throw createAppError('Confirmation not found or expired', 404, 'CONFIRMATION_NOT_FOUND');
    }
    if (pending.userId !== userId) {
      throw createAppError('Not your confirmation', 403, 'CONFIRMATION_FORBIDDEN');
    }
    // Consume before acting: exactly one decision per confirmation.
    consumePendingConfirmation(confirmationId);

    const deniedDef = findToolDefinition(pending.toolName);
    const deniedCard = (code: string, message: string): ToolExecutionCard => ({
      toolName: pending.toolName,
      callId: pending.callId,
      status: 'failed',
      label: deniedDef
        ? `Declined: ${describePlannedAction(deniedDef, pending.args as Record<string, unknown>)}`
        : `Declined "${pending.toolName}"`,
      input: pending.args,
      error: { code, message },
      durationMs: 0,
      confirmationId: pending.id,
    });

    if (!approved) {
      return reply.send({
        success: true,
        data: {
          toolExecution: deniedCard(
            'CONFIRMATION_DENIED',
            'The action was not approved. Nothing was created, changed, or deleted.',
          ),
        },
      });
    }

    // The kill switch still applies between proposal and approval.
    if (process.env.ENABLE_AUTONOMOUS_TOOLS !== 'true') {
      return reply.send({
        success: true,
        data: {
          toolExecution: deniedCard(
            'TOOLING_DISABLED',
            'Autonomous tools were disabled before the action was approved. Nothing was executed.',
          ),
        },
      });
    }

    const def = findToolDefinition(pending.toolName);
    if (!def || !def.wired) {
      return reply.send({
        success: true,
        data: {
          toolExecution: deniedCard(
            'NOT_WIRED',
            `${pending.toolName} is not wired yet — nothing was executed.`,
          ),
        },
      });
    }

    const card = await executeAutonomousTool(
      fastify,
      userId,
      pending.toolName,
      pending.callId,
      pending.args as Record<string, any>,
      request,
    );
    return reply.send({ success: true, data: { toolExecution: card } });
  });
}
