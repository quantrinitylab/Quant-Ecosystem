// ============================================================================
// QuantCooks CP-1 — Group K: the planner (tool 54). Registered with a
// fail-closed executor so the name, schema and quote shape are pinned
// now; the real planner is CP-6's build (in-app as the AI Director
// panel, in-chat as QuantAI — one tool, two faces, never two prices).
//
// Planning is synchronous and NEVER charges: the plan carries per-step
// quotes and a total, and execution is the caller invoking the step
// tools after approval. The 2 conditional marketplace tools
// (list_campaigns / submit_to_campaign) are NOT registered — they exist
// only in the G-17 marketplace variant Krish has not selected (§3.11);
// their names stay reserved and unclaimed.
// ============================================================================

import { z } from 'zod';
import type { ToolRegistry } from '../registry';
import { failClosed } from '../registry';
import { out } from './shared';

export function registerPlannerTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.plan_project',
    group: 'planner',
    description:
      'Plan a creative project from a brief: returns steps (tool + params + per-step quote), a total quote and notes. Planning itself never charges; nothing executes until the caller approves the plan and invokes the steps. Refuses with PLANNER_NOT_CONFIGURED until the CP-6 planner lands.',
    mode: 'sync',
    tier: 'B',
    permissionTier: 0,
    notConfiguredCode: 'PLANNER_NOT_CONFIGURED',
    inputSchema: z.object({
      brief: z.string().min(1),
      projectId: z.string().optional(),
      budgetCapCredits: z.number().int().positive().optional(),
    }),
    outputSchema: out({
      plan: z.object({
        steps: z.array(
          z.object({
            stepId: z.string(),
            tool: z.string(),
            params: z.record(z.string(), z.unknown()),
            quoteCredits: z.number(),
          }),
        ),
        totalQuoteCredits: z.number(),
        notes: z.string(),
      }),
    }),
    example: { input: { brief: 'A 30-second launch film for our biryani' } },
    execute: failClosed(
      'PLANNER_NOT_CONFIGURED',
      'The project planner is not configured on this deployment yet (CP-6)',
    ),
  });
}
