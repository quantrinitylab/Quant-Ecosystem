// ============================================================================
// QuantCooks CP-1 — registry assembly: ToolDeps construction + the full
// 58-tool registration (54 manifest + 2 ratified Craft twins + the 2
// design-companion amendments from C-7 step 4).
//
// Deps are constructed EXACTLY the way the routes construct the same
// services today (narrow-prisma DI over fastify.prisma, the decorated
// storage port, companion runners resolved from env or injected) — the
// registry wraps the same service instances' behaviour, never a second
// implementation. Credits: CP-2 wires the real port by default (built
// from the same prisma; null when the ledger delegate is absent, §6.2) —
// an injected `credits` option (including an explicit null, as the test
// rig passes) always wins over the default.
// ============================================================================

import { AIEngine } from '@quant/ai';
import type { StoragePort } from '../services/storage.adapter';
import { ProjectService } from '../services/project.service';
import { LayerService } from '../services/layer.service';
import { AssetService } from '../services/asset.service';
import { TemplateService } from '../services/template.service';
import { EffectsService } from '../services/effects.service';
import { BrandKitService } from '../services/brand-kit.service';
import { CollaborationService } from '../services/collaboration.service';
import { AIVideoService } from '../services/ai-video.service';
import {
  AutoEditOrchestrator,
  type RenderPort,
} from '../services/auto-edit-orchestrator.service';
import { FfmpegAutoEditRenderer } from '../services/ffmpeg-auto-edit-renderer';
import { CraftRenderService } from '../services/craft-render.service';
import { PhotoEditService } from '../services/photo-edit.service';
import { DesignService } from '../services/design.service';
import {
  resolveEffectCraftBin,
  NodeEffectCraftRunner,
  renderTimeoutFromEnv,
  type EffectCraftRunner,
} from '../services/effectcraft.adapter';
import {
  resolvePhotoCraftBin,
  NodePhotoCraftRunner,
  editTimeoutFromEnv,
  type PhotoCraftRunner,
} from '../services/photocraft.adapter';
import {
  resolveFigCraftBin,
  NodeFigCraftRunner,
  designTimeoutFromEnv,
  type FigCraftRunner,
} from '../services/figcraft.adapter';
import { buildCreditsExecutionPort } from '../services/credits.adapter';
import { InMemoryAuditSink, ToolRegistry, type ToolDeps } from './registry';
import { JobService } from './jobs';
import { QuoteStore, validateRateTable, type CreditsExecutionPort } from './pricing';
import { registerProjectTools } from './definitions/projects.tools';
import { registerAssetTools } from './definitions/assets.tools';
import { registerCatalogueTools } from './definitions/catalogue.tools';
import { registerAiTextTools } from './definitions/ai-text.tools';
import { registerAutoEditTools } from './definitions/auto-edit.tools';
import { registerJobTools } from './definitions/jobs.tools';
import { registerCreditTools } from './definitions/credits.tools';
import { registerDiscoveryTools } from './definitions/discovery.tools';
import { registerGenerationTools } from './definitions/generation.tools';
import { registerFlaggedTools } from './definitions/flagged.tools';
import { registerPlannerTools } from './definitions/planner.tools';
import { registerCraftTools } from './definitions/craft.tools';
import { registerDesignTools } from './definitions/design.tools';

export interface BuildToolRegistryOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any;
  storage: StoragePort | null;
  /** Injected companion runners win; `undefined` resolves from env
   *  (EFFECTCRAFT_BIN / PHOTOCRAFT_BIN), `null` forces unconfigured. */
  craftRunner?: EffectCraftRunner | null;
  photoRunner?: PhotoCraftRunner | null;
  figcraftRunner?: FigCraftRunner | null;
  /** An injected port (or explicit null) wins; `undefined` builds the
   *  real CP-2 port from prisma — null when no ledger is configured. */
  credits?: CreditsExecutionPort | null;
  ai?: AIEngine;
}

/** Mirrors routes/auto-edit.ts renderer(): real ffmpeg renderer only
 *  when an output location is configured, else the orchestrator's own
 *  fail-closed NullRenderer. */
function buildAutoEditRenderer(): RenderPort | undefined {
  const outputDir = process.env['AUTO_EDIT_OUTPUT_DIR'];
  const outputBaseUrl = process.env['AUTO_EDIT_OUTPUT_BASE_URL'];
  if (!outputDir || !outputBaseUrl) return undefined;
  return new FfmpegAutoEditRenderer({ outputDir, outputBaseUrl });
}

function resolveCraftRunner(injected: EffectCraftRunner | null | undefined): EffectCraftRunner | null {
  if (injected !== undefined) return injected;
  const bin = resolveEffectCraftBin();
  return bin ? new NodeEffectCraftRunner(bin, renderTimeoutFromEnv()) : null;
}

function resolvePhotoRunner(injected: PhotoCraftRunner | null | undefined): PhotoCraftRunner | null {
  if (injected !== undefined) return injected;
  const bin = resolvePhotoCraftBin();
  return bin ? new NodePhotoCraftRunner(bin, editTimeoutFromEnv()) : null;
}

function resolveFigCraftRunner(injected: FigCraftRunner | null | undefined): FigCraftRunner | null {
  if (injected !== undefined) return injected;
  const bin = resolveFigCraftBin();
  return bin ? new NodeFigCraftRunner(bin, designTimeoutFromEnv()) : null;
}

export function buildToolRegistry(options: BuildToolRegistryOptions): {
  registry: ToolRegistry;
  deps: ToolDeps;
  auditLog: InMemoryAuditSink;
} {
  validateRateTable();

  const prisma = options.prisma;
  const storage = options.storage;
  const auditLog = new InMemoryAuditSink();

  const deps: ToolDeps = {
    prisma,
    storage,
    projects: new ProjectService(prisma),
    layers: new LayerService(prisma),
    assets: new AssetService(prisma, storage),
    templates: new TemplateService(),
    effects: new EffectsService(),
    brandKits: new BrandKitService(prisma),
    collaboration: new CollaborationService(prisma),
    aiVideo: new AIVideoService(options.ai ?? new AIEngine()),
    // The registry's orchestrator deliberately gets NO CreditsPort: on
    // the tool path the registry itself reserves/settles the flat-10
    // price through the CreditsExecutionPort (§6.2), so an orchestrator
    // port here would double-charge. The direct /auto-edit route wires
    // its own orchestrator with §6.5's port instead (routes/auto-edit.ts).
    orchestrator: new AutoEditOrchestrator(prisma as never, {
      ...(buildAutoEditRenderer() ? { renderer: buildAutoEditRenderer() } : {}),
    }),
    jobs: new JobService(prisma, storage),
    craftRenders: new CraftRenderService(prisma, storage, resolveCraftRunner(options.craftRunner)),
    photoEdits: new PhotoEditService(prisma, storage, resolvePhotoRunner(options.photoRunner)),
    design: new DesignService(prisma, storage, resolveFigCraftRunner(options.figcraftRunner)),
    credits:
      options.credits !== undefined ? options.credits : buildCreditsExecutionPort(prisma),
    quotes: new QuoteStore(),
    audit: auditLog.sink,
    durationProbe: async (assetId, userId) => {
      const row = (await prisma.editAsset.findFirst({
        where: { id: assetId },
      })) as { userId: string | null; metadata: unknown } | null;
      if (!row) return null;
      if (row.userId !== null && row.userId !== undefined && row.userId !== userId) return null;
      const meta =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {};
      const duration = meta['duration'];
      return typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
    },
  };

  const registry = new ToolRegistry(deps);
  deps.registry = registry;

  registerProjectTools(registry);
  registerAssetTools(registry);
  registerCatalogueTools(registry);
  registerAiTextTools(registry);
  registerAutoEditTools(registry);
  registerJobTools(registry);
  registerCreditTools(registry);
  registerDiscoveryTools(registry);
  registerGenerationTools(registry);
  registerFlaggedTools(registry);
  registerPlannerTools(registry);
  registerCraftTools(registry);
  registerDesignTools(registry);

  return { registry, deps, auditLog };
}

/**
 * §8 boot-time rule: one log line per NOT_CONFIGURED dependency (reason +
 * affected tool count), so "why is this tool refusing" is answerable
 * from logs, not from reading code.
 */
export function logToolAvailability(
  registry: ToolRegistry,
  log: (message: string) => void,
): void {
  const byReason = new Map<string, string[]>();
  for (const summary of registry.summaries()) {
    if (summary.availability === 'not_configured' && summary.notConfiguredReason) {
      const list = byReason.get(summary.notConfiguredReason) ?? [];
      list.push(summary.name);
      byReason.set(summary.notConfiguredReason, list);
    }
  }
  for (const [reason, tools] of byReason) {
    log(
      `QUANTCOOKS_TOOLS_NOT_CONFIGURED: ${reason} — ${tools.length} tool(s) fail closed (${tools.join(', ')})`,
    );
  }
  log(
    `QUANTCOOKS_TOOLS_REGISTERED: ${registry.names().length} tools (54 manifest + 2 ratified craft twins + 2 design amendments)`,
  );
}
