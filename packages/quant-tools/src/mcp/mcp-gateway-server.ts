// ============================================================================
// Quanty MCP Gateway — protocol-compliant MCP server (Streamable HTTP)
//
// JSON-RPC 2.0 over a single POST endpoint per the MCP Streamable HTTP
// transport. Methods: `initialize`, `ping`, `tools/list`, `tools/call`
// (plus `notifications/initialized`). Tool calls route to the handlers
// registered on the ToolExecutor — the owning handlers already in
// quant-tools — with the caller's identity threaded through
// ToolExecutionContext (userId + metadata['jwt']).
//
// Confirmation gating: tools with riskTier >= 2 NEVER auto-execute. The
// first tools/call returns a pending QuantyApprovalRequest (the merged
// send-mail card pattern: the in-app surface renders the card from this
// payload); the client re-calls with `_confirmation: {approvalId, approved}`
// to proceed or cancel. Tier 3 (destructive/admin) is additionally gated by
// confirmationPolicy 'always' — same flow, surfaced for step-up auth by the
// client surface (step-up itself is P1-2 scope).
//
// Honesty: tools listed without a registered handler return an explicit
// `not_implemented` error on call — never a fabricated result.
// ============================================================================

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { QuantyApprovalRequest } from '@quant/quanty-contracts';
import { ToolExecutor } from '../executor/tool-executor.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { requiredScopesForTool } from '../connect-once/capability-scopes.js';
import type {
  MCPToolEntry,
  PermissionTier,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from '../types.js';
import { toMcpInputSchema, toRiskTier, toToolDescriptor } from './descriptor-mapping.js';

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 plumbing
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
// MCP reserves -32000..-32099 for implementation-defined server errors.
const UNAUTHENTICATED = -32001;

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function err(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

// ---------------------------------------------------------------------------
// Auth + confirmation
// ---------------------------------------------------------------------------

export interface McpAuthContext {
  userId: string;
  tier: PermissionTier;
  bearer: string;
  /**
   * Granted capability scopes (connect-once OAuth, P1-2). Empty for legacy
   * `registerToken` tokens: an empty-scope context means "pre-capability
   * token, tier-checked only" — the scope gate is skipped and the original
   * tier-only behavior is preserved exactly.
   */
  scopes: string[];
}

/**
 * P1-2 seam: resolves a bearer token to the capabilities it carries.
 * The gateway consults this FIRST in `resolveAuth`; a null result falls back
 * to the legacy in-memory `registerToken` map. Inject via
 * `QuantyMcpServerOptions.tokenResolver`. (The ready-made implementation is
 * `JwtCapabilityTokenResolver` in `../connect-once/gateway-resolver.js`.)
 */
export interface CapabilityTokenResolver {
  resolve(bearer: string): Promise<ResolvedCapabilities | null>;
}

export interface ResolvedCapabilities {
  userId: string;
  scopes: string[];
  /** Expiry of the underlying token, milliseconds since epoch. */
  expiresAtMs: number;
  /**
   * Optional coarse tier for the token. When omitted the gateway stamps tier
   * 3 on the auth context: capability tokens express authority through
   * scopes (checked per tool call below), so the tier gate stays permissive
   * and the scope vocabulary is the authority. Tier >= 2 per-call
   * confirmations still fire based on each tool's own tier.
   */
  tier?: PermissionTier;
}

interface TokenEntry {
  userId: string;
  tier: PermissionTier;
}

/** Reserved envelope key inside tools/call `arguments` carrying a confirmation decision. */
export const CONFIRMATION_ARG_KEY = '_confirmation';

export interface ConfirmationEnvelope {
  approvalId: string;
  approved: boolean;
}

interface PendingApproval {
  approval: QuantyApprovalRequest;
  toolId: string;
  args: Record<string, unknown>;
  auth: McpAuthContext;
}

export type ToolCallOutcome =
  | { kind: 'executed'; result: ToolResult }
  | { kind: 'confirmation-required'; approval: QuantyApprovalRequest }
  | { kind: 'confirmation-rejected'; approvalId: string }
  | { kind: 'confirmation-invalid'; error: string }
  | { kind: 'not-implemented'; error: string };

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export const MCP_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'] as const;
export const MCP_LATEST_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_NAME = 'quanty-mcp-gateway';
export const MCP_SERVER_VERSION = '1.0.0';
const MAX_BODY_BYTES = 1024 * 1024;
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

export interface QuantyMcpServerOptions {
  confirmationTtlMs?: number;
  /**
   * P1-2 capability-token seam. When set, `resolveAuth` asks the resolver
   * first and only falls back to the legacy `registerToken` map on null.
   */
  tokenResolver?: CapabilityTokenResolver;
}

export class QuantyMcpServer {
  private readonly registry: ToolRegistry;
  private readonly executor: ToolExecutor;
  private readonly tokens = new Map<string, TokenEntry>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly confirmationTtlMs: number;
  private readonly tokenResolver?: CapabilityTokenResolver;

  constructor(registry: ToolRegistry, executor: ToolExecutor, options?: QuantyMcpServerOptions) {
    this.registry = registry;
    this.executor = executor;
    this.confirmationTtlMs = options?.confirmationTtlMs ?? CONFIRMATION_TTL_MS;
    this.tokenResolver = options?.tokenResolver;
  }

  // -- tokens ---------------------------------------------------------------

  registerToken(token: string, userId: string, tier: PermissionTier): void {
    this.tokens.set(token, { userId, tier });
  }

  revokeToken(token: string): boolean {
    return this.tokens.delete(token);
  }

  authenticate(bearer: string | undefined): McpAuthContext | null {
    if (!bearer) {
      return null;
    }
    const entry = this.tokens.get(bearer);
    if (!entry) {
      return null;
    }
    return { userId: entry.userId, tier: entry.tier, bearer, scopes: [] };
  }

  /**
   * P1-2: resolve a bearer to an auth context. The capability-token resolver
   * (if configured) is consulted FIRST; legacy `registerToken` entries are
   * the fallback, so existing callers keep working unchanged.
   */
  async resolveAuth(bearer: string | undefined): Promise<McpAuthContext | null> {
    if (!bearer) {
      return null;
    }
    if (this.tokenResolver) {
      const resolved = await this.tokenResolver.resolve(bearer);
      if (resolved) {
        return {
          userId: resolved.userId,
          tier: resolved.tier ?? 3,
          bearer,
          scopes: resolved.scopes,
        };
      }
    }
    return this.authenticate(bearer);
  }

  // -- catalog ---------------------------------------------------------------

  getCatalog(): MCPToolEntry[] {
    return this.registry.listAll().map((tool) => ({
      name: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema,
      permissionTier: tool.permissionTier,
    }));
  }

  // -- tool call dispatch (shared by JSON-RPC and the legacy adapter) --------

  async dispatchToolCall(
    toolId: string,
    rawArgs: Record<string, unknown>,
    auth: McpAuthContext,
  ): Promise<ToolCallOutcome> {
    const tool = this.registry.get(toolId);
    if (!tool) {
      throw new McpRpcError(INVALID_PARAMS, `Unknown tool: '${toolId}'`);
    }

    if (auth.tier < tool.permissionTier) {
      throw new McpRpcError(
        UNAUTHENTICATED,
        `Insufficient permissions: '${toolId}' requires tier ${tool.permissionTier}`,
        { requiredTier: tool.permissionTier, grantedTier: auth.tier },
      );
    }

    // P1-2 capability-scope gate: when the auth context carries scopes
    // (connect-once token), every scope the tool requires must be granted.
    // Empty scopes = pre-capability legacy token: tier check above is the
    // only gate (unchanged behavior).
    if (auth.scopes.length > 0) {
      const required = requiredScopesForTool(tool);
      const missing = required.filter((scope) => !auth.scopes.includes(scope));
      if (missing.length > 0) {
        throw new McpRpcError(
          UNAUTHENTICATED,
          `Insufficient capability scopes: '${toolId}' requires ${missing.join(', ')}`,
          {
            requiredScopes: required,
            grantedScopes: auth.scopes,
            missingScopes: missing,
          },
        );
      }
    }

    // Strip the reserved confirmation envelope before schema validation.
    const { [CONFIRMATION_ARG_KEY]: confirmationRaw, ...args } = rawArgs;
    const confirmation = parseConfirmationEnvelope(confirmationRaw);

    const validation = this.registry.validateInput(toolId, args);
    if (!validation.valid) {
      throw new McpRpcError(INVALID_PARAMS, `Invalid arguments for '${toolId}'`, {
        errors: validation.errors,
      });
    }

    const descriptor = toToolDescriptor(tool);

    // Risk-tier gate: tier >= 2 never auto-executes.
    if (descriptor.riskTier >= 2) {
      if (!confirmation) {
        return { kind: 'confirmation-required', approval: this.issueApproval(tool, args, auth) };
      }
      const decision = this.resolveApproval(confirmation, toolId, auth);
      if (decision.kind !== 'approved') {
        return decision;
      }
    } else if (confirmation) {
      // Stray envelope on a low-tier call — ignore it rather than failing.
    }

    if (!this.executor.hasHandler(toolId)) {
      return {
        kind: 'not-implemented',
        error:
          `Tool '${toolId}' is declared in the catalog but has no live handler — ` +
          'not wired yet. No action was taken.',
      };
    }

    const context: ToolExecutionContext = {
      userId: auth.userId,
      sessionId: `mcp-${Date.now()}`,
      permissions: auth.tier,
      dryRun: false,
      metadata: { jwt: auth.bearer },
    };
    const result = await this.executor.executeSingle(toolId, args, context);
    return { kind: 'executed', result };
  }

  // -- confirmation lifecycle -------------------------------------------------

  private issueApproval(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    auth: McpAuthContext,
  ): QuantyApprovalRequest {
    const approvalId = `apr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const riskTier = toRiskTier(tool.permissionTier);
    const approval: QuantyApprovalRequest = {
      approvalId,
      taskId: `mcp-${auth.userId}`,
      nodeId: tool.id,
      actionSummary: `${tool.name}: ${tool.description}`,
      targetSummary: truncateJson(args, 500),
      riskTier,
      expiresAt: new Date(Date.now() + this.confirmationTtlMs).toISOString(),
      confirmationChannels: ['touch', 'text'],
      status: 'pending',
    };
    this.pendingApprovals.set(approvalId, { approval, toolId: tool.id, args, auth });
    return approval;
  }

  private resolveApproval(
    confirmation: ConfirmationEnvelope,
    toolId: string,
    auth: McpAuthContext,
  ):
    | { kind: 'approved' }
    | { kind: 'confirmation-rejected'; approvalId: string }
    | { kind: 'confirmation-invalid'; error: string } {
    const pending = this.pendingApprovals.get(confirmation.approvalId);
    if (!pending) {
      return {
        kind: 'confirmation-invalid',
        error: `Unknown approvalId '${confirmation.approvalId}' — request a fresh confirmation first.`,
      };
    }
    if (pending.toolId !== toolId || pending.auth.userId !== auth.userId) {
      return {
        kind: 'confirmation-invalid',
        error: `Approval '${confirmation.approvalId}' does not match this tool/user.`,
      };
    }
    if (Date.parse(pending.approval.expiresAt) <= Date.now()) {
      this.pendingApprovals.delete(confirmation.approvalId);
      return {
        kind: 'confirmation-invalid',
        error: `Approval '${confirmation.approvalId}' expired — request a fresh confirmation.`,
      };
    }
    // Single-use: consume on decision either way.
    this.pendingApprovals.delete(confirmation.approvalId);
    if (!confirmation.approved) {
      return { kind: 'confirmation-rejected', approvalId: confirmation.approvalId };
    }
    return { kind: 'approved' };
  }

  // -- JSON-RPC dispatcher ----------------------------------------------------

  /**
   * Handle one JSON-RPC message. Returns null for notifications (no response).
   * `bearer` is the raw Authorization bearer value for this request.
   */
  async handleJsonRpc(
    message: JsonRpcRequest,
    bearer: string | undefined,
  ): Promise<JsonRpcResponse | null> {
    const id = message.id ?? null;
    const isNotification = message.id === undefined;

    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return err(id, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
    }

    try {
      switch (message.method) {
        case 'initialize':
          return ok(id, this.handleInitialize(message.params));
        case 'notifications/initialized':
          return null;
        case 'ping':
          return ok(id, {});
        case 'tools/list':
          await this.requireAuth(bearer, message.method);
          return ok(id, { tools: this.listMcpTools() });
        case 'tools/call':
          return ok(id, await this.handleToolsCall(message.params, bearer));
        default:
          throw new McpRpcError(METHOD_NOT_FOUND, `Method not found: '${message.method}'`);
      }
    } catch (e) {
      if (isNotification) {
        return null;
      }
      if (e instanceof McpRpcError) {
        return err(id, e.code, e.message, e.data);
      }
      return err(id, -32603, e instanceof Error ? e.message : 'Internal error');
    }
  }

  private async requireAuth(bearer: string | undefined, method: string): Promise<McpAuthContext> {
    const auth = await this.resolveAuth(bearer);
    if (!auth) {
      throw new McpRpcError(
        UNAUTHENTICATED,
        `Unauthenticated: '${method}' requires a registered Bearer token`,
      );
    }
    return auth;
  }

  private handleInitialize(params: unknown): Record<string, unknown> {
    const requested =
      typeof params === 'object' && params !== null
        ? (params as Record<string, unknown>)['protocolVersion']
        : undefined;
    const protocolVersion =
      typeof requested === 'string' &&
      (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
        ? requested
        : MCP_LATEST_PROTOCOL_VERSION;
    return {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    };
  }

  private listMcpTools(): Array<Record<string, unknown>> {
    return this.registry.listAll().map((tool) => ({
      name: tool.id,
      description: tool.description,
      inputSchema: toMcpInputSchema(tool.inputSchema),
      annotations: {
        riskTier: toRiskTier(tool.permissionTier),
        confirmationPolicy: toToolDescriptor(tool).confirmationPolicy,
        readOnlyHint: tool.permissionTier === 0,
        destructiveHint: tool.permissionTier >= 2,
        requiredScopes: requiredScopesForTool(tool),
      },
    }));
  }

  private async handleToolsCall(
    params: unknown,
    bearer: string | undefined,
  ): Promise<Record<string, unknown>> {
    const auth = await this.requireAuth(bearer, 'tools/call');
    if (typeof params !== 'object' || params === null) {
      throw new McpRpcError(INVALID_PARAMS, "'tools/call' params must be an object");
    }
    const { name, arguments: args } = params as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new McpRpcError(INVALID_PARAMS, "'tools/call' requires a string 'name'");
    }
    const callArgs =
      args === undefined
        ? {}
        : typeof args === 'object' && args !== null && !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : (() => {
              throw new McpRpcError(INVALID_PARAMS, "'tools/call' 'arguments' must be an object");
            })();

    const outcome = await this.dispatchToolCall(name, callArgs, auth);

    switch (outcome.kind) {
      case 'executed': {
        const r = outcome.result;
        return {
          content: [
            {
              type: 'text',
              text: r.success ? JSON.stringify(r.data) : `Tool error: ${r.error ?? 'unknown'}`,
            },
          ],
          isError: !r.success,
          ...(r.success ? {} : { _meta: { quanty: { toolError: true, toolId: name } } }),
        };
      }
      case 'confirmation-required':
        return confirmationCardResult(outcome.approval);
      case 'confirmation-rejected':
        return {
          content: [
            {
              type: 'text',
              text: `Confirmation rejected by user (approval ${outcome.approvalId}). No action was taken.`,
            },
          ],
          isError: true,
          _meta: { quanty: { confirmationRejected: true, approvalId: outcome.approvalId } },
        };
      case 'confirmation-invalid':
        throw new McpRpcError(INVALID_PARAMS, outcome.error);
      case 'not-implemented':
        return {
          content: [{ type: 'text', text: outcome.error }],
          isError: true,
          _meta: { quanty: { notImplemented: true, toolId: name } },
        };
    }
  }

  // -- Streamable HTTP transport ----------------------------------------------

  /**
   * Wire into node:http: `createServer((req, res) => void server.handleHttp(req, res))`.
   * POST is the only method (Streamable HTTP). GET/DELETE → 405.
   */
  async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          err(null, INVALID_REQUEST, `Method ${req.method ?? '?'} not allowed; use POST`),
        ),
      );
      return;
    }

    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(err(null, INVALID_REQUEST, 'Content-Type must be application/json')));
      return;
    }

    const accept = req.headers['accept'] ?? '';
    if (accept !== '' && !accept.includes('application/json') && !accept.includes('*/*')) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(err(null, INVALID_REQUEST, 'Accept must include application/json')),
      );
      return;
    }

    const clientVersion = req.headers['mcp-protocol-version'];
    if (
      typeof clientVersion === 'string' &&
      !(MCP_PROTOCOL_VERSIONS as readonly string[]).includes(clientVersion)
    ) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          err(null, INVALID_REQUEST, `Unsupported MCP-Protocol-Version: '${clientVersion}'`),
        ),
      );
      return;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(err(null, INVALID_REQUEST, e instanceof Error ? e.message : 'Bad body')),
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(err(null, PARSE_ERROR, 'Parse error: body is not valid JSON')));
      return;
    }

    const bearer = bearerFromHeader(req.headers['authorization']);
    const messages: JsonRpcRequest[] = Array.isArray(parsed) ? parsed : [parsed];

    const responses: JsonRpcResponse[] = [];
    for (const message of messages) {
      const response = await this.handleJsonRpc(message as JsonRpcRequest, bearer);
      if (response !== null) {
        responses.push(response);
      }
    }

    if (responses.length === 0) {
      // Notification-only batch → 202 Accepted, no body (per Streamable HTTP).
      res.writeHead(202);
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.isArray(parsed) ? responses : responses[0]));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bearerFromHeader(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] ?? undefined;
}

function parseConfirmationEnvelope(raw: unknown): ConfirmationEnvelope | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { approvalId, approved } = raw as Record<string, unknown>;
  if (typeof approvalId !== 'string' || typeof approved !== 'boolean') {
    return null;
  }
  return { approvalId, approved };
}

function truncateJson(value: unknown, max: number): string {
  const s = JSON.stringify(value) ?? '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** The confirmation-card payload (merged #784 send-mail card pattern): the
 *  client surface renders the approval; the client answers via `_confirmation`. */
function confirmationCardResult(approval: QuantyApprovalRequest): Record<string, unknown> {
  const card = [
    'CONFIRMATION REQUIRED',
    `Tool: ${approval.nodeId} (risk tier ${approval.riskTier})`,
    `Action: ${approval.actionSummary}`,
    `Call: ${approval.targetSummary}`,
    `Approval ID: ${approval.approvalId} (expires ${approval.expiresAt})`,
    `To proceed, call tools/call again with arguments._confirmation = {"approvalId":"${approval.approvalId}","approved":true}; use "approved":false to cancel.`,
    'Nothing has been executed.',
  ].join('\n');
  return {
    content: [{ type: 'text', text: card }],
    isError: false,
    _meta: {
      quanty: {
        confirmationRequired: true,
        approvalId: approval.approvalId,
        riskTier: approval.riskTier,
        expiresAt: approval.expiresAt,
      },
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body exceeds 1MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', (e) => reject(e));
  });
}
