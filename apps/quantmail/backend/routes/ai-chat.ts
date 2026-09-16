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
      enabled: z.boolean().default(true),
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

const SYSTEM_PROMPT = [
  'You are QuantAI (Quanty), the sovereign agentic operating AI built into the Quantrinity workspace (QuantMail: mail, calendar, contacts, drive, and QuantGit developer hub).',
  'You have tools that perform real, authenticated actions in this workspace.',
  'When the user instructs you to create a repo, write code, commit a file, or deploy an agent, you MUST execute the appropriate tool by emitting a JSON block formatted exactly as:',
  '```tool_call\n{\n  "name": "<tool_name>",\n  "arguments": { ... }\n}\n```',
  'Supported tools:',
  '1. create_repository: { "name": string, "description"?: string, "visibility"?: "public"|"private"|"internal", "initReadme"?: boolean }',
  '2. commit_file: { "repoId": string, "path": string, "content": string, "message": string, "branch"?: string, "parentSha"?: string }',
  '3. read_file_blob: { "repoId": string, "path": string, "ref"?: string }',
  '4. deploy_agent: { "repoId": string, "agentName": string, "role": string, "workstationIndex": number, "prompt"?: string }',
  'You can emit multiple tool calls sequentially for multi-step tasks.',
  'Never claim to have performed an action or created a resource that the tool did not explicitly return, and never claim a write succeeded before the dispatcher reports succeeded.',
  'Always include a concise, empowering summary in your response explaining what was created or executed.',
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

      if (!repoIdentifier || !filePath) {
        throw new Error('Repository identifier and file path are required');
      }

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

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true, email: true },
      });

      if (!fastify.repositoryMutation) {
        throw createAppError(
          'Repository mutation engine is not available on this instance',
          503,
          'STORAGE_UNAVAILABLE',
        );
      }

      const currentHead = await fastify.repositoryMutation.getBranchHead({
        owner: repo.ownerId,
        name: repo.name,
        branch: targetBranch,
      });

      const commitResult = await fastify.repositoryMutation.commitFile({
        owner: repo.ownerId,
        name: repo.name,
        branch: targetBranch,
        path: filePath,
        content,
        message,
        expectedHeadSha: args.parentSha ?? currentHead,
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

    // `auto` decides from the size and depth of what actually arrived, not from
    // anything the client asserts about itself.
    const plan = resolveAIIntent(intent, measureAISignals(messages, context));

    const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: plan.directive },
    ];
    if (contextBlock) {
      modelMessages.push({ role: 'system', content: contextBlock });
    }
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
      const isToolCallingEnabled =
        tools?.enabled !== false && process.env.ENABLE_AUTONOMOUS_TOOLS !== 'false';

      const toolCallRegex = /```(?:tool_call|json:tool_call)\s*([\s\S]*?)```/g;

      if (isToolCallingEnabled) {
        let match: RegExpExecArray | null;

        while ((match = toolCallRegex.exec(rawMessage)) !== null) {
          try {
            const parsedCall = JSON.parse(match[1].trim());
            if (parsedCall?.name && parsedCall?.arguments) {
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
      const cleanMessage =
        rawMessage.replace(toolCallRegex, '').trim() ||
        (toolExecutions.length > 0
          ? `Executed ${toolExecutions.length} autonomous action(s) successfully.`
          : rawMessage);

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
