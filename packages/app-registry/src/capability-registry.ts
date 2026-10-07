/**
 * EC-01 — Runtime capability registry (§6 invocation contract, EC-01.3).
 *
 * The registry describes what the ecosystem can do. Product policy decides
 * whether it may do it. Runtime authorization decides whether this caller
 * may do it now. Verification decides whether it actually happened (§17).
 *
 * Fail-closed throughout: unknown capability/version, missing scopes,
 * unverifiable ownership, and missing approval all deny before any side
 * effect runs.
 */
import type {
  Capability,
  CapabilityKind,
  CapabilityOwnerId,
  CapabilityStatus,
  InvocationContext,
  InvocationResult,
  QuantAppId,
} from './capability-types';
import { QUANT_APP_IDS } from './capability-types';
import { CapabilityError } from './capability-errors';
import { resolveVersion } from './capability-versioning';
import {
  checkIdempotency,
  evaluatePolicy,
  recordIdempotency,
  type IdempotencyStore,
  MemoryIdempotencyStore,
} from './capability-policy';

/** Capability-id namespace per owning app (doc 21 §4 canonical catalog). */
const APP_NAMESPACE: Record<QuantAppId, string> = {
  quantmail: 'mail',
  quantchat: 'chat',
  quantai: 'ai',
  quantgram: 'gram',
  quantwave: 'wave',
  quantmax: 'max',
  quantube: 'tube',
  quantcooks: 'cooks',
  quantads: 'ads',
};

/** Namespaces owned by the shared platform (§5). */
const PLATFORM_NAMESPACES = new Set([
  'identity',
  'resource',
  'search',
  'notification',
  'memory',
  'economy',
  'audit',
  'feature_flag',
]);

/** Product-owned hooks the registry calls but never implements. */
export interface RegistryHooks {
  /**
   * Execute the owning product's command. The ONLY place a side effect
   * happens. Must validate input, enforce resource ownership, and return
   * the typed result. Throw CapabilityError (or any Error → wrapped).
   */
  execute: (capability: Capability, context: InvocationContext) => Promise<unknown>;
  /**
   * Verify the success event after execution (§6: an HTTP 200 before
   * business verification is not final success).
   */
  verifyEvent?: (
    capability: Capability,
    context: InvocationContext,
    result: unknown,
  ) => Promise<'verified' | 'unknown' | 'failed'>;
  /** Persist the §14 observability record. Never receives bodies/secrets. */
  recordAudit?: (entry: AuditEntry) => Promise<void>;
  /**
   * Verify the caller owns (or may act on) the target resource.
   * Absent → fail closed (RESOURCE_FORBIDDEN): the registry cannot
   * verify what it cannot see.
   */
  checkOwnership?: (capability: Capability, context: InvocationContext) => Promise<boolean>;
}

/** §14 observability record — metadata only, never message bodies. */
export interface AuditEntry {
  capabilityId: string;
  version: number;
  sourceApp: string;
  targetApp: string;
  actorType: string;
  userIdRef?: string;
  tenantId?: string;
  correlationId?: string;
  resourceRef?: string;
  riskTier: number;
  approvalState: string;
  latencyMs: number;
  resultState: string;
  verificationState: string;
  errorCode?: string;
}

export interface RegistryOptions {
  hooks?: RegistryHooks;
  idempotencyStore?: IdempotencyStore;
}

function expectedNamespace(capability: Capability): string | null {
  if (capability.owner.appId === 'platform') return null;
  return APP_NAMESPACE[capability.appId] ?? null;
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability[]>();
  private readonly hooks: RegistryHooks;
  private readonly idempotency: IdempotencyStore;

  constructor(options: RegistryOptions = {}) {
    this.hooks = options.hooks ?? {
      execute: async () => {
        throw new CapabilityError('DEPENDENCY_UNAVAILABLE', 'no executor hook registered');
      },
    };
    this.idempotency = options.idempotencyStore ?? new MemoryIdempotencyStore();
  }

  /** Register one capability descriptor. Throws CapabilityError on any contract violation. */
  register(capability: Capability): void {
    validateDescriptor(capability);
    const key = capability.capabilityId;
    const versions = this.capabilities.get(key) ?? [];
    if (versions.some((c) => c.version === capability.version)) {
      throw new CapabilityError(
        'CAPABILITY_VERSION_UNSUPPORTED',
        `duplicate registration: ${key}.v${capability.version}`,
      );
    }
    versions.push(Object.freeze({ ...capability }));
    versions.sort((a, b) => a.version - b.version);
    this.capabilities.set(key, versions);
  }

  /** Resolve a capability, fail-closed (§2 law 10). */
  resolve(capabilityId: string, version?: number): Capability {
    const versions = this.capabilities.get(capabilityId);
    if (!versions || versions.length === 0) {
      throw new CapabilityError('CAPABILITY_NOT_FOUND', capabilityId);
    }
    return resolveVersion(versions, version).capability;
  }

  /** All registered capability ids. */
  ids(): string[] {
    return [...this.capabilities.keys()].sort();
  }

  /** All versions of one capability id (empty when unknown). */
  versionsOf(capabilityId: string): readonly Capability[] {
    return this.capabilities.get(capabilityId) ?? [];
  }

  /**
   * Cross-capability validation (EC-01.3): every `consumes` event must be
   * emitted by at least one registered capability. Returns diagnostics;
   * throws when `strict` and any diagnostic is an error.
   */
  validate(strict = false): string[] {
    const emitted = new Set<string>();
    for (const versions of this.capabilities.values()) {
      for (const c of versions) {
        for (const e of c.emits) emitted.add(e);
        for (const e of c.verification.successEvents) emitted.add(e);
      }
    }
    const diagnostics: string[] = [];
    for (const versions of this.capabilities.values()) {
      for (const c of versions) {
        for (const event of c.consumes ?? []) {
          if (!emitted.has(event)) {
            diagnostics.push(
              `undeclared event reference: ${c.capabilityId}.v${c.version} consumes '${event}' which no capability emits`,
            );
          }
        }
      }
    }
    if (strict && diagnostics.length > 0) {
      throw new CapabilityError('APP_POLICY_DENIED', diagnostics.join('; '));
    }
    return diagnostics;
  }

  /**
   * Run the §6 invocation contract end to end.
   *
   * resolve → version → caller → audience → tenant → scope → ownership →
   * input → policy/risk → approval → idempotency → execute → verify →
   * audit → typed result.
   */
  async invoke(
    capabilityId: string,
    context: InvocationContext,
    version?: number,
  ): Promise<InvocationResult> {
    const startedAt = Date.now();
    let capability: Capability;
    try {
      capability = this.resolve(capabilityId, version);
    } catch (err) {
      return this.failure(capabilityId, 0, err, startedAt, context, 'resolve');
    }
    if (capability.status === 'disabled') {
      return this.failure(
        capability, 0, new CapabilityError('CAPABILITY_DISABLED', capabilityId),
        startedAt, context, 'status',
      );
    }

    // Caller validation.
    if (
      (context.callerType === 'user' || context.callerType === 'quanty') &&
      !context.userId
    ) {
      return this.failure(capability, 0, new CapabilityError('AUTH_REQUIRED', 'user-scoped caller without userId'), startedAt, context, 'caller');
    }

    // Scope validation — runtime authorization input (§9).
    const missing = capability.requiredScopes.filter((s) => !context.scopes.includes(s));
    if (missing.length > 0) {
      return this.failure(capability, 0, new CapabilityError('SCOPE_DENIED', `missing scopes: ${missing.join(', ')}`), startedAt, context, 'scope');
    }

    // Resource ownership — fail closed when unverifiable.
    if (!this.hooks.checkOwnership) {
      return this.failure(capability, 0, new CapabilityError('RESOURCE_FORBIDDEN', 'no ownership checker registered — cannot verify resource ownership'), startedAt, context, 'ownership');
    }
    try {
      const owns = await this.hooks.checkOwnership(capability, context);
      if (!owns) {
        return this.failure(capability, 0, new CapabilityError('RESOURCE_FORBIDDEN', 'caller does not own the target resource'), startedAt, context, 'ownership');
      }
    } catch (err) {
      return this.failure(capability, 0, err, startedAt, context, 'ownership');
    }

    // Policy / risk evaluation → approval / step-up.
    const decision = evaluatePolicy(capability, context);
    if (!decision.allowed) {
      const code = decision.error === 'STEP_UP_REQUIRED' ? 'STEP_UP_REQUIRED' : 'APP_POLICY_DENIED';
      return this.failure(
        capability, 0,
        new CapabilityError(code, decision.detail),
        startedAt, context, 'policy',
      );
    }
    if (decision.requiresApproval) {
      await this.audit(capability, context, startedAt, 'approval_required', 'pending', undefined);
      return {
        ok: false,
        capabilityId: capability.capabilityId,
        version: capability.version,
        state: 'approval_required',
        error: 'APPROVAL_REQUIRED',
        detail: decision.approvalReason,
        latencyMs: Date.now() - startedAt,
      };
    }

    // Idempotency check before any side effect.
    try {
      const { replay, result } = await checkIdempotency(capability, context, this.idempotency);
      if (replay) {
        await this.audit(capability, context, startedAt, 'replayed', 'verified', undefined);
        return {
          ok: true,
          capabilityId: capability.capabilityId,
          version: capability.version,
          state: 'replayed',
          data: result,
          verificationState: 'verified',
          latencyMs: Date.now() - startedAt,
        };
      }
    } catch (err) {
      return this.failure(capability, 0, err, startedAt, context, 'idempotency');
    }

    // Execute the owning product's command — the only side effect.
    let data: unknown;
    try {
      data = await this.hooks.execute(capability, context);
    } catch (err) {
      return this.failure(capability, 0, err, startedAt, context, 'execute');
    }

    // Verify the success event (§6: HTTP 200 before verification is not final).
    let verificationState: 'verified' | 'unknown' | 'failed' = 'verified';
    if (capability.verification.required) {
      try {
        verificationState = this.hooks.verifyEvent
          ? await this.hooks.verifyEvent(capability, context, data)
          : 'unknown';
      } catch {
        verificationState = 'failed';
      }
      if (verificationState === 'failed') {
        return this.failure(capability, 0, new CapabilityError('VERIFICATION_FAILED', `success event not observed for ${capability.capabilityId}`), startedAt, context, 'verify', verificationState);
      }
      if (verificationState === 'unknown') {
        const code = capability.verification.timeoutState === 'unknown'
          ? 'OPERATION_TIMEOUT_UNKNOWN'
          : 'VERIFICATION_FAILED';
        return this.failure(capability, 0, new CapabilityError(code as 'OPERATION_TIMEOUT_UNKNOWN', `verification timed out for ${capability.capabilityId} — reconciliation required`), startedAt, context, 'verify', verificationState);
      }
    }

    await recordIdempotency(capability, context, this.idempotency, data);
    await this.audit(capability, context, startedAt, 'executed', verificationState, undefined);
    return {
      ok: true,
      capabilityId: capability.capabilityId,
      version: capability.version,
      state: 'executed',
      data,
      verificationState,
      latencyMs: Date.now() - startedAt,
    };
  }

  private async failure(
    capability: Capability | string,
    _unused: number,
    err: unknown,
    startedAt: number,
    context: InvocationContext,
    stage: string,
    verificationState: 'verified' | 'unknown' | 'failed' = 'failed',
  ): Promise<InvocationResult> {
    const code = err instanceof CapabilityError ? err.code : 'DEPENDENCY_UNAVAILABLE';
    const detail = err instanceof Error ? err.message : String(err);
    const id = typeof capability === 'string' ? capability : capability.capabilityId;
    const version = typeof capability === 'string' ? 0 : capability.version;
    if (typeof capability !== 'string') {
      await this.audit(capability, context, startedAt, `failed:${stage}`, verificationState, code);
    }
    return {
      ok: false,
      capabilityId: id,
      version,
      state: 'failed',
      error: code,
      detail,
      verificationState,
      latencyMs: Date.now() - startedAt,
    };
  }

  private async audit(
    capability: Capability,
    context: InvocationContext,
    startedAt: number,
    resultState: string,
    verificationState: string,
    errorCode: string | undefined,
  ): Promise<void> {
    if (!this.hooks.recordAudit) return;
    const entry: AuditEntry = {
      capabilityId: capability.capabilityId,
      version: capability.version,
      sourceApp: context.audience ?? context.callerType,
      targetApp: capability.appId,
      actorType: context.callerType,
      userIdRef: context.userId,
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      riskTier: capability.riskTier,
      approvalState: context.approvalGranted ? 'granted' : 'not_required_or_pending',
      latencyMs: Date.now() - startedAt,
      resultState,
      verificationState,
      errorCode,
    };
    await this.hooks.recordAudit(entry);
  }
}

/**
 * EC-01.5 contract validation for a single descriptor. Throws CapabilityError.
 * - every command declares scopes
 * - every side effect declares verification success events
 * - Tier 3/4 actions declare approval semantics
 * - every capability declares degraded behavior
 * - active capabilities prove a real routeRef
 * - capability ids use their owner's namespace
 * - versions are positive integers
 */
export function validateDescriptor(c: Capability): void {
  const where = c.capabilityId || '<unnamed>';
  if (!c.capabilityId || typeof c.capabilityId !== 'string') {
    throw new CapabilityError('APP_POLICY_DENIED', `${where}: capabilityId is required`);
  }
  if (!Number.isInteger(c.version) || c.version < 1) {
    throw new CapabilityError('APP_POLICY_DENIED', `${where}: version must be a positive integer`);
  }
  const owner: CapabilityOwnerId = c.owner?.appId;
  if (owner !== 'platform' && !QUANT_APP_IDS.includes(owner as QuantAppId)) {
    throw new CapabilityError('APP_POLICY_DENIED', `${where}: unknown owner app '${String(owner)}'`);
  }
  if (owner !== 'platform' && c.appId !== owner) {
    throw new CapabilityError(
      'APP_POLICY_DENIED',
      `${where}: product capabilities must be owned by their own app (appId ${c.appId} ≠ owner ${String(owner)})`,
    );
  }
  const ns = expectedNamespace(c);
  if (ns && !c.capabilityId.startsWith(`${ns}.`)) {
    throw new CapabilityError(
      'APP_POLICY_DENIED',
      `${where}: capability id must use the '${ns}.' namespace of ${c.appId}`,
    );
  }
  if (owner === 'platform') {
    const prefix = c.capabilityId.split('.')[0] ?? '';
    if (!PLATFORM_NAMESPACES.has(prefix)) {
      throw new CapabilityError(
        'APP_POLICY_DENIED',
        `${where}: platform capability id must use a platform namespace (${[...PLATFORM_NAMESPACES].join(', ')})`,
      );
    }
  }
  if (c.kind === 'command' && c.requiredScopes.length === 0) {
    throw new CapabilityError('APP_POLICY_DENIED', `${where}: commands must declare requiredScopes`);
  }
  if (c.kind === 'command' && c.verification.required && c.verification.successEvents.length === 0) {
    throw new CapabilityError(
      'APP_POLICY_DENIED',
      `${where}: side effects must declare verification successEvents`,
    );
  }
  if ((c.riskTier === 3 || c.riskTier === 4) && !c.approval.required) {
    throw new CapabilityError(
      'APP_POLICY_DENIED',
      `${where}: tier ${c.riskTier} actions must declare approval semantics`,
    );
  }
  if (!c.degradedMode || !c.degradedMode.userState) {
    throw new CapabilityError('APP_POLICY_DENIED', `${where}: degraded behavior must be declared`);
  }
  if (c.status === 'active' && !c.routeRef) {
    throw new CapabilityError(
      'APP_POLICY_DENIED',
      `${where}: active capabilities must prove a real routeRef — use 'preview' until wired`,
    );
  }
  if (c.routeRef && c.routeRef.appId !== c.appId) {
    throw new CapabilityError(
      'APP_POLICY_DENIED',
      `${where}: routeRef appId must match the capability's appId`,
    );
  }
  const validStatus: CapabilityStatus[] = ['active', 'preview', 'deprecated', 'disabled'];
  if (!validStatus.includes(c.status)) {
    throw new CapabilityError('APP_POLICY_DENIED', `${where}: unknown status '${String(c.status)}'`);
  }
  const validKind: CapabilityKind[] = ['query', 'command', 'event', 'projection'];
  if (!validKind.includes(c.kind)) {
    throw new CapabilityError('APP_POLICY_DENIED', `${where}: unknown kind '${String(c.kind)}'`);
  }
}
