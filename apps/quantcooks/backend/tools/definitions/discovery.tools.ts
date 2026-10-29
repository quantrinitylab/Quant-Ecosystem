// ============================================================================
// QuantCooks CP-1 — Group H: generation discovery (tools 34–35, Tier B
// until their data exists). Both refuse rather than return an empty
// list: an empty catalogue would falsely claim "no models/presets
// exist" as a fact about the world rather than about our configuration
// (§3.8).
// ============================================================================

import { z } from 'zod';
import type { ToolRegistry } from '../registry';
import { failClosed } from '../registry';
import { out } from './shared';

export function registerDiscoveryTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.list_models',
    group: 'discovery',
    description:
      'List the generation models available for a media kind (the G-1 model catalogue as data, with capabilities and a credit hint per model). Refuses with PROVIDER_NOT_CONFIGURED until a provider catalogue exists.',
    mode: 'sync',
    tier: 'B',
    permissionTier: 0,
    publicCatalogue: true,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      kind: z.enum(['image', 'video', 'audio', 'all']).optional().default('all'),
    }),
    outputSchema: out({ models: z.array(z.unknown()) }),
    example: { input: {} },
    execute: failClosed(
      'PROVIDER_NOT_CONFIGURED',
      'No generation provider is configured, so there is no model catalogue to list',
    ),
  });

  registry.register({
    name: 'quantcooks.list_camera_presets',
    group: 'discovery',
    description:
      'List the food camera-move presets (Plate Push-In, Cheese-Pull Crash Zoom, Cake Orbit, Thali Top-Down Drop, Pack Spin, Buffet Fly-Over and friends) as data, with stackability and sample costs. Refuses with PRESETS_NOT_CONFIGURED until the G-4 library lands as data.',
    mode: 'sync',
    tier: 'B',
    permissionTier: 0,
    publicCatalogue: true,
    notConfiguredCode: 'PRESETS_NOT_CONFIGURED',
    inputSchema: z.object({
      foodContext: z.string().optional(),
    }),
    outputSchema: out({ presets: z.array(z.unknown()) }),
    example: { input: {} },
    execute: failClosed(
      'PRESETS_NOT_CONFIGURED',
      'The camera preset library is not configured on this deployment yet (G-4)',
    ),
  });
}
