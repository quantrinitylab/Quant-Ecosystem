// ============================================================================
// AI Core - Tool Calling (Function Calling)
// ============================================================================
//
// Production-grade function calling for the Quant Ecosystem AI engine.
// Compatible with OpenAI-style function calling via the Vercel AI SDK.
//
// A tool definition describes a function the LLM can invoke. When the model
// decides a tool is needed, it returns structured tool calls which the
// caller executes and feeds back as tool results.

/** JSON Schema for tool parameters (subset of JSON Schema draft 2020-12) */
export interface ToolParametersSchema {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  default?: unknown;
}

/** A tool the LLM can call */
export interface ToolDefinition {
  /** Unique tool name (e.g. 'quantmail.send') */
  name: string;
  /** Human-readable description for the model */
  description: string;
  /** JSON Schema for the tool's parameters */
  parameters: ToolParametersSchema;
  /** Whether the tool needs user confirmation before execution */
  requiresConfirmation?: boolean;
}

/** A tool call requested by the LLM */
export interface ToolCall {
  /** Unique ID for this call */
  id: string;
  /** Tool name */
  name: string;
  /** Parsed arguments object */
  arguments: Record<string, unknown>;
  /** Raw arguments JSON (for debugging) */
  rawArguments?: string;
}

/** Result of executing a tool call */
export interface ToolResult {
  /** Matches ToolCall.id */
  toolCallId: string;
  /** Tool name */
  name: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Result payload (serializable) */
  result?: unknown;
  /** Error message if failed */
  error?: string;
}

/**
 * Fail-closed verdict for a single LLM-proposed tool call.
 *
 * - `allow`: execute immediately.
 * - `deny`: do NOT execute; the denial reason is fed back to the model as a
 *   tool error so it can answer without the tool (or stop).
 * - `hold`: the call needs Sentinel confirmation. The engine stops the loop
 *   and returns `finishReason: 'confirmation_required'` with the hold token;
 *   the host app resumes via its own approval flow (e.g. held plans).
 */
export type ToolCallVerdict =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string }
  | { decision: 'hold'; holdToken: string; reason: string };

/** Context passed to tool-loop hooks for a single inference. */
export interface ToolLoopContext {
  userId: string;
  /** Caller-assessed permission tier (0=Auto, 1=Notify, 2=Confirm, 3=Admin). */
  permissionTier: number;
}

/**
 * Hooks that close the LLM tool-calling loop. Injected by the host
 * application (e.g. the QuantAI backend) so `@quant/ai` stays decoupled
 * from permission stores, executors, and approval UX.
 */
export interface ToolLoopHooks {
  /**
   * Fail-closed permission check for a proposed tool call.
   * When absent, the engine treats every proposed call as `allow` — hosts
   * MUST provide this when executing consequential tools.
   */
  checkToolCall?: (call: ToolCall, ctx: ToolLoopContext) => Promise<ToolCallVerdict>;
  /** Execute a single approved tool call and return its serializable result. */
  executeToolCall?: (
    call: ToolCall,
    ctx: ToolLoopContext,
  ) => Promise<ToolResult>;
}

/** A set of tool calls held for Sentinel confirmation. */
export interface HeldToolCalls {
  /** Opaque token the host's approval flow uses to resume (e.g. planId). */
  holdToken: string;
  reason: string;
  calls: ToolCall[];
}

/** Tool choice strategy */
export type ToolChoice = 'auto' | 'none' | 'required' | { toolName: string };

/**
 * Convert our ToolDefinition to Vercel AI SDK tool format.
 * The SDK's `tool()` helper wraps these; we return the plain spec
 * so the engine can pass them directly to generateText/streamText.
 */
export function toVercelTools(tools: ToolDefinition[]): Record<string, unknown> {
  const vercelTools: Record<string, unknown> = {};
  for (const t of tools) {
    vercelTools[t.name] = {
      description: t.description,
      inputSchema: t.parameters,
    };
  }
  return vercelTools;
}

/**
 * Validate tool definitions. Throws on invalid definitions.
 */
export function validateToolDefinitions(tools: ToolDefinition[]): void {
  const seen = new Set<string>();
  for (const t of tools) {
    if (!t.name || typeof t.name !== 'string') {
      throw new Error('ToolDefinition.name must be a non-empty string');
    }
    if (seen.has(t.name)) {
      throw new Error(`Duplicate tool name: ${t.name}`);
    }
    seen.add(t.name);
    if (!t.description || typeof t.description !== 'string') {
      throw new Error(`Tool ${t.name}: description must be a non-empty string`);
    }
    if (!t.parameters || t.parameters.type !== 'object') {
      throw new Error(`Tool ${t.name}: parameters must be a JSON Schema object`);
    }
  }
}

/**
 * Parse a raw tool call from the Vercel AI SDK into our ToolCall shape.
 */
export function parseToolCall(raw: {
  toolCallId: string;
  toolName: string;
  input: unknown;
}): ToolCall {
  let args: Record<string, unknown> = {};
  let rawArgs: string | undefined;
  if (typeof raw.input === 'string') {
    rawArgs = raw.input;
    try {
      args = JSON.parse(raw.input) as Record<string, unknown>;
    } catch {
      args = { _raw: raw.input };
    }
  } else if (raw.input && typeof raw.input === 'object') {
    args = raw.input as Record<string, unknown>;
  }
  return {
    id: raw.toolCallId,
    name: raw.toolName,
    arguments: args,
    rawArguments: rawArgs,
  };
}
