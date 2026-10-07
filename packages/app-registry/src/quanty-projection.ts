/**
 * EC-01 — Quanty tool projection (§7).
 *
 * Quanty never receives the raw registry and never receives database access.
 * It receives this policy-filtered projection: only capabilities the agent
 * policy allows, with approval requirements surfaced per tool.
 */
import type {
  Capability,
  QuantAppId,
  QuantyTool,
  RiskTier,
} from './capability-types';
import type { CapabilityRegistry } from './capability-registry';

export interface ProjectionPolicy {
  /** Maximum risk tier Quanty may see. Default 2 (reads, drafts, low-risk). */
  maxRiskTier?: RiskTier;
  /** Whether preview (not yet runtime-wired) capabilities are projected. Default false. */
  allowPreview?: boolean;
  /** Restrict to these apps; default all. */
  allowedApps?: QuantAppId[];
  /** Capability ids never projected. */
  blockedCapabilities?: string[];
}

/**
 * Build the policy-filtered tool list for Quanty.
 *
 * Rules:
 * - disabled/deprecated capabilities are never projected;
 * - preview capabilities only when the policy explicitly allows;
 * - risk tier above maxRiskTier is excluded;
 * - requiresApproval = declared approval OR tier >= 3;
 * - cost is surfaced only when the capability declares a meter.
 */
export function projectForQuanty(
  registry: CapabilityRegistry,
  policy: ProjectionPolicy = {},
): QuantyTool[] {
  const maxRiskTier = policy.maxRiskTier ?? 2;
  const allowPreview = policy.allowPreview ?? false;
  const blocked = new Set(policy.blockedCapabilities ?? []);

  const tools: QuantyTool[] = [];
  for (const id of registry.ids()) {
    if (blocked.has(id)) continue;
    for (const capability of registry.versionsOf(id)) {
      if (capability.status === 'disabled' || capability.status === 'deprecated') continue;
      if (capability.status === 'preview' && !allowPreview) continue;
      if (capability.riskTier > maxRiskTier) continue;
      if (policy.allowedApps && !policy.allowedApps.includes(capability.appId)) continue;
      tools.push(toQuantyTool(capability));
    }
  }
  return tools.sort((a, b) => a.toolId.localeCompare(b.toolId));
}

function toQuantyTool(capability: Capability): QuantyTool {
  const tool: QuantyTool = {
    toolId: `${capability.capabilityId}.v${capability.version}`,
    capabilityId: capability.capabilityId,
    version: capability.version,
    description: describe(capability),
    inputSchema: capability.inputSchema,
    riskTier: capability.riskTier,
    requiresApproval: capability.approval.required || capability.riskTier >= 3,
  };
  if (capability.cost?.meter) {
    tool.estimatedCost = { credits: 0, meter: capability.cost.meter };
  }
  return tool;
}

function describe(capability: Capability): string {
  const kind = capability.kind === 'query' ? 'Read' : capability.kind === 'command' ? 'Do' : capability.kind;
  return `${kind} ${capability.capabilityId} (${capability.appId}, tier ${capability.riskTier})`;
}
