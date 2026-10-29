// ============================================================================
// QuantCooks CP-1 — Group D: text AI, the existing real surfaces (tools
// 23–24, Tier A). Wraps services/ai-video.service.ts (K1: the plan's
// manifest omitted the only two AI tools that actually exist; the
// registry registers reality).
//
// Both are FLAT 1 credit (§6.3, matching the AITools catalogue's existing
// price). Metering is CP-2's: until then they execute unmetered and the
// invoke envelope states metering 'not_wired' (§6.2) — never presented
// as a charge that happened.
// ============================================================================

import { z } from 'zod';
import type { ToolRegistry } from '../registry';
import { out } from './shared';
import { TitleInputSchema, CaptionInputSchema } from '../../services/ai-video.service';

export function registerAiTextTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.suggest_titles',
    group: 'ai-text',
    description:
      'Suggest catchy video titles for a description (optionally tuned per platform). Costs 1 credit once metering is wired (CP-2); unmetered until then.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 2,
    inputSchema: TitleInputSchema,
    outputSchema: out({ titles: z.array(z.string()) }),
    example: {
      input: { description: 'A 60-second biryani recipe film', count: 3 },
      output: { titles: ['Biryani in 60 Seconds'] },
    },
    execute: async (input, ctx, deps) => {
      const result = await deps.aiVideo.suggestTitles(input, ctx.actorUserId);
      return { titles: result.titles };
    },
  });

  registry.register({
    name: 'quantcooks.generate_captions',
    group: 'ai-text',
    description:
      'Write a caption/description from a transcript (concise, detailed or funny). Returns a single caption string. Costs 1 credit once metering is wired (CP-2); unmetered until then.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 2,
    inputSchema: CaptionInputSchema,
    outputSchema: out({ caption: z.string() }),
    example: {
      input: { transcript: 'Today we make dum biryani…', style: 'concise' },
      output: { caption: 'Dum biryani, step by step.' },
    },
    execute: async (input, ctx, deps) => {
      const result = await deps.aiVideo.generateCaptions(input, ctx.actorUserId);
      return { caption: result.caption };
    },
  });
}
