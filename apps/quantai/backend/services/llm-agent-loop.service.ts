// ============================================================================
// LLM Agent Loop Service
// ============================================================================
// Opt-in replacement for keyword IntentRouter planning on /agentic/chat.
//
// Instead of regex/tag scoring, the LLM itself proposes tool calls. Each
// proposed call is permission-checked FAIL-CLOSED before execution:
//   - tier 0/1  -> executed immediately via the gateway executor
//   - tier 2+   -> held through the gateway's existing Sentinel mechanism;
//                  the client gets the standard planId -> /agentic/confirm
//                  approval flow (no new UX contract)
//   - forbidden -> denied; the denial is fed back to the model as a tool
//                  error so it can answer without the tool
//
// Results feed back into the model (max 5 tool rounds, 60s total budget).
// Only tools with a LIVE handler are offered to the model.

import { AIEngine as CoreAIEngine } from '@quant/ai';
import type {
  ToolCall,
  ToolCallVerdict,
  ToolDefinition as AiToolDefinition,
  ToolLoopHooks,
  ToolResult as LlmToolResult,
} from '@quant/ai';
import {
  allTools,
  PermissionEngine,
  type PermissionTier,
  type ToolDefinition as QuantToolDefinition,
} from '@quant/quant-tools';
import { getAgentGateway } from './agent-gateway.service';

/**
 * Tools the LLM loop may offer. Deliberately narrow: only tools with a
 * verified live HTTP handler. (quantchat.send is excluded — its route key
 * has a typo; quantmail.send keeps its configured tier, fixed elsewhere.)
 */
const LLM_TOOL_ALLOWLIST = [
  'quantmail.send',
  'quantmail.search',
  'quantmail.archive',
  'quantmail.draft',
  'quantchat.search',
];

const INPUT_TYPE_MAP: Record<string, 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object',
  array: 'array',
};

/** quant-tools ToolDefinition -> LLM function-calling ToolDefinition. */
function toAiToolDefinition(def: QuantToolDefinition): AiToolDefinition {
  const properties: Record<
    string,
    { type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'; description?: string; default?: unknown }
  > = {};
  const required: string[] = [];
  for (const [name, rawField] of Object.entries(def.inputSchema)) {
    // Structural access: keeps this compiling even when the workspace
    // package types are unresolved (dist not built in some environments).
    const field = rawField as {
      type: string;
      required: boolean;
      description: string;
      default?: unknown;
    };
    properties[name] = {
      type: INPUT_TYPE_MAP[field.type] ?? 'string',
      description: field.description,
      ...(field.default !== undefined ? { default: field.default } : {}),
    };
    if (field.required) {
      required.push(name);
    }
  }
  return {
    name: def.id,
    description: def.description,
    parameters: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

export interface LlmAgentChatOptions {
  userId: string;
  /** Delegated user JWT forwarded to target app backends. */
  jwt: string;
  message: string;
  sessionId?: string;
  permissionTier?: PermissionTier;
  model?: string;
  dryRun?: boolean;
}

export type LlmAgentChatOutcome =
  | { status: 'completed'; content: string; model: string; truncated?: boolean }
  | {
      status: 'confirmation_required';
      planId: string;
      reason: string;
      calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    };

let coreEngine: CoreAIEngine | null = null;

function getCoreEngine(): CoreAIEngine {
  if (!coreEngine) {
    coreEngine = new CoreAIEngine();
  }
  return coreEngine;
}

const SYSTEM_PROMPT = [
  'You are QuantAI, the agentic brain of the Quant ecosystem.',
  'You can act in the user\'s connected apps (QuantMail, QuantChat) using the tools provided.',
  'Rules:',
  '- Only call a tool when it is genuinely needed to fulfill the request.',
  '- Prefer read-only tools (search) before acting tools (send/archive).',
  '- Never invent tool results; if a tool errors, say so honestly and offer alternatives.',
  '- Keep the final answer concise and grounded in what the tools actually returned.',
].join('\n');

export async function runLlmAgentChat(
  opts: LlmAgentChatOptions,
): Promise<LlmAgentChatOutcome> {
  const gateway = getAgentGateway();
  const permissionEngine = new PermissionEngine(allTools);
  const permissionTier = opts.permissionTier ?? 1;

  // Structural access keeps this working even when the workspace package
  // types are unresolved (dist not built in some environments).
  const allDefs = allTools as unknown as QuantToolDefinition[];
  const byId = new Map(allDefs.map((t) => [t.id, t]));
  const tools: AiToolDefinition[] = [];
  for (const id of LLM_TOOL_ALLOWLIST) {
    const def = byId.get(id);
    if (!def) continue;
    // Only offer tools with a live handler — never let the model propose
    // something that cannot execute.
    if (!gateway.getExecutor().hasHandler(id)) continue;
    tools.push(toAiToolDefinition(def));
  }

  const requestId = `llm-loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const checkToolCall = async (
    call: ToolCall,
    ctx: { userId: string; permissionTier: number },
  ): Promise<ToolCallVerdict> => {
    const verdict = permissionEngine.evaluate(call.name, ctx.permissionTier as PermissionTier);
    if (!verdict.allowed) {
      return { decision: 'deny', reason: verdict.reason };
    }
    if (verdict.confirmationRequired) {
      // Hold through the gateway's existing Sentinel mechanism: synthesize
      // a single-step plan so the client gets the standard
      // planId -> POST /agentic/confirm/:planId approval flow.
      const plan = {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        steps: [
          {
            stepId: `step-${call.id}`,
            toolId: call.name,
            params: call.arguments,
            dependsOn: [],
            outputKey: 'output',
          },
        ],
        estimatedCost: 'low',
        requiredPermission: 2 as PermissionTier,
        description: `LLM-proposed tool call: ${call.name}`,
      };
      try {
        const gate = gateway.checkPermissions(plan, ctx.permissionTier as PermissionTier);
        if (gate.held) {
          gateway.bindHeldPlan(gate.planId, opts.userId);
          return { decision: 'hold', holdToken: gate.planId, reason: gate.reason };
        }
      } catch (err) {
        return {
          decision: 'deny',
          reason: err instanceof Error ? err.message : 'Permission gate refused',
        };
      }
      return { decision: 'deny', reason: 'Confirmation required but the plan could not be held' };
    }
    return { decision: 'allow' };
  };

  const executeToolCall = async (call: ToolCall): Promise<LlmToolResult> => {
    // Only tier < 2 calls reach here (tier-2+ are held above). The
    // executor's own defense-in-depth enforcement is the second gate.
    const result = await gateway.getExecutor().executeSingle(call.name, call.arguments, {
      userId: opts.userId,
      sessionId: opts.sessionId ?? `sess-${Date.now()}`,
      permissions: permissionTier,
      dryRun: opts.dryRun ?? false,
      metadata: { jwt: opts.jwt, requestId },
    });
    return {
      toolCallId: call.id,
      name: call.name,
      success: result.success,
      result: result.data ?? undefined,
      error: result.error,
    };
  };

  const hooks: ToolLoopHooks = { checkToolCall, executeToolCall };

  const response = await getCoreEngine().infer({
    prompt: opts.message,
    systemPrompt: SYSTEM_PROMPT,
    userId: opts.userId,
    app: 'quantai',
    feature: 'agentic-chat-llm',
    model: opts.model,
    tools,
    toolChoice: 'auto',
    maxToolRounds: 5,
    toolLoopTimeoutMs: 60000,
    permissionTier,
    toolHooks: hooks,
  });

  if (response.finishReason === 'confirmation_required' && response.pendingConfirmation) {
    return {
      status: 'confirmation_required',
      planId: response.pendingConfirmation.holdToken,
      reason: response.pendingConfirmation.reason,
      calls: response.pendingConfirmation.calls.map((c) => ({
        id: c.id,
        name: c.name,
        arguments: c.arguments,
      })),
    };
  }

  return {
    status: 'completed',
    content: response.content,
    model: response.model,
    truncated: response.toolLoopTruncated,
  };
}
