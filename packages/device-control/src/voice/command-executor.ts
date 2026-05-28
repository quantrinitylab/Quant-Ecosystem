import type { CapabilityRegistry } from '../registry.js';
import type { DeviceCapability } from '../capabilities/types.js';
import { CAPABILITY_TIER_MAP } from '../permissions/permission-types.js';
import type { DeviceIntent, CustomShortcut, ExecutionResult } from './types.js';

export class CommandExecutor {
  constructor(private registry: CapabilityRegistry) {}

  async execute(intent: DeviceIntent, confirmed?: boolean): Promise<ExecutionResult> {
    // Use nullish coalescing for capabilities not in the tier map (extended caps
    // like alarm, iot, media). Unknown capabilities default to tier 0 (no
    // confirmation needed) and will report "No provider" if unregistered.
    const tier = CAPABILITY_TIER_MAP[intent.capability as DeviceCapability] ?? 0;
    if (tier >= 3 && !confirmed) {
      return { success: false, results: [{ intent, success: false }], requiresConfirmation: true };
    }
    const provider = this.registry.get(intent.capability as DeviceCapability);
    const success = !!provider;
    return {
      success,
      results: [
        {
          intent,
          success,
          error: success ? undefined : `Capability '${intent.capability}' is not yet supported`,
        },
      ],
    };
  }

  // Sequences (shortcuts/macros) pass confirmed=true by default because the user
  // explicitly created the macro, implicitly confirming all contained actions.
  // Callers can opt-in to per-intent confirmation by passing confirmed=false.
  async executeSequence(
    intents: DeviceIntent[],
    opts?: { stopOnFailure?: boolean; confirmed?: boolean },
  ): Promise<ExecutionResult> {
    const confirmed = opts?.confirmed ?? true;
    const results: ExecutionResult['results'] = [];
    for (const intent of intents) {
      const r = await this.execute(intent, confirmed);
      results.push(...r.results);
      if (!r.success && opts?.stopOnFailure) {
        return { success: false, results };
      }
    }
    return { success: results.every((r) => r.success), results };
  }

  async executeShortcut(shortcut: CustomShortcut, confirmed?: boolean): Promise<ExecutionResult> {
    return this.executeSequence(shortcut.actions, {
      stopOnFailure: shortcut.stopOnFailure,
      confirmed: confirmed ?? true,
    });
  }
}
