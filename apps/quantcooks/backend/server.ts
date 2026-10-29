// ============================================================================
// QuantEdits (@quant/quantcooks) backend — production server entry.
// buildApp() (in app.ts) only assembles the Fastify instance; this entry starts
// it listening. Runs as its own container; the frontend proxies /api -> here.
//
// The export processor (P0-4) starts here and ONLY here: app.ts/buildApp must
// stay worker-free so tests that build the app never spawn ffmpeg work. The
// processor is gated on object storage being configured — without storage
// there is nowhere honest to put rendered outputs, so it stays off, jobs
// remain QUEUED, and the boot log says exactly that (never fake progress).
// ============================================================================
import { buildApp, getConfig } from './app.js';

async function main(): Promise<void> {
  const config = getConfig();
  const app = await buildApp(config);

  // --- Export processor (P0-4) ---------------------------------------------
  // Dynamic imports: the storage adapter / processor / renderer module graph
  // (storage SDK, media) loads only in the real server process, mirroring
  // the routes' injection pattern.
  let processor: { stop(): Promise<void> } | null = null;
  if (process.env['EXPORT_PROCESSOR_DISABLED'] === '1') {
    app.log.info('EXPORT_PROCESSOR_DISABLED: disabled by EXPORT_PROCESSOR_DISABLED=1');
  } else {
    const { buildStoragePort } = await import('./services/storage.adapter.js');
    const storage = buildStoragePort();
    if (!storage) {
      app.log.info(
        'EXPORT_PROCESSOR_DISABLED: storage not configured — export jobs will stay QUEUED until storage env is set',
      );
    } else {
      const { ExportService } = await import('./services/export.service.js');
      const { ExportProcessor } = await import('./services/export-processor.js');
      const { StorageExportRenderer } = await import('./services/export-renderer.js');
      const { adaptExportPrisma } = await import('./services/job-delegate-adapters.js');

      const prisma = (app as unknown as { prisma: never }).prisma;
      // CP-1 fold-in: the service's persistence runs on EditJob via the
      // EXPORT delegate adapter; the processor keeps the raw client for
      // its own project/layer/asset lookups.
      const service = new ExportService(adaptExportPrisma(prisma), storage);
      const renderer = new StorageExportRenderer(storage);
      const instance = new ExportProcessor({
        service,
        renderer,
        prisma,
        storage,
        logger: {
          info: (msg: string) => app.log.info(msg),
          error: (msg: string) => app.log.error(msg),
        },
      });
      instance.start();
      processor = instance;
      app.log.info('EXPORT_PROCESSOR_ENABLED: polling EditJob (kind EXPORT) for QUEUED exports');
    }
  }

  // --- Craft render processor (C-2) -----------------------------------------
  // Same discipline as the export processor — only here, only when
  // configured — with one deliberate difference: the gate is the companion
  // binary (EFFECTCRAFT_BIN), not storage. A render claimed while storage is
  // unconfigured fails at claim time with STORAGE_NOT_CONFIGURED (never
  // hangs); with no binary, no render can even be created — the craft
  // surface answers CRAFT_NOT_CONFIGURED.
  let craftProcessor: { stop(): Promise<void> } | null = null;
  if (process.env['CRAFT_RENDER_PROCESSOR_DISABLED'] === '1') {
    app.log.info('CRAFT_RENDER_PROCESSOR_DISABLED: disabled by CRAFT_RENDER_PROCESSOR_DISABLED=1');
  } else {
    const { resolveEffectCraftBin, NodeEffectCraftRunner, renderTimeoutFromEnv, PINNED_EFFECTCRAFT } =
      await import('./services/effectcraft.adapter.js');
    const bin = resolveEffectCraftBin();
    if (!bin) {
      app.log.info(
        'CRAFT_RENDER_PROCESSOR_DISABLED: EFFECTCRAFT_BIN is unset or not executable — craft renders cannot be created',
      );
    } else {
      const { buildStoragePort } = await import('./services/storage.adapter.js');
      const { CraftRenderService } = await import('./services/craft-render.service.js');
      const { CraftRenderProcessor } = await import('./services/craft-render-processor.js');
      const { AssetService } = await import('./services/asset.service.js');
      const { adaptCraftPrisma } = await import('./services/job-delegate-adapters.js');

      const prisma = (app as unknown as { prisma: never }).prisma;
      const storage = buildStoragePort();
      const runner = new NodeEffectCraftRunner(bin, renderTimeoutFromEnv());
      const instance = new CraftRenderProcessor({
        // CP-1 fold-in: persistence on EditJob via the CRAFT_RENDER adapter.
        service: new CraftRenderService(adaptCraftPrisma(prisma), storage, runner),
        assets: new AssetService(prisma, storage),
        runner,
        storage,
        logger: {
          info: (msg: string) => app.log.info(msg),
          error: (msg: string) => app.log.error(msg),
        },
      });
      await instance.start();
      craftProcessor = instance;
      app.log.info(
        `CRAFT_RENDER_PROCESSOR_ENABLED: polling EditJob (kind CRAFT_RENDER); companion ${bin} (pinned ${PINNED_EFFECTCRAFT.version})`,
      );
      // Pin-change alarm (spike §5 step 1): a detected version other than
      // the pin is logged loudly, never silently accepted.
      runner
        .probeVersion()
        .then((detected) => {
          if (!detected.includes(PINNED_EFFECTCRAFT.version)) {
            app.log.warn(
              `EFFECTCRAFT VERSION MISMATCH: detected "${detected}", pinned ${PINNED_EFFECTCRAFT.version} — treat as a pin change, do not ignore`,
            );
          }
        })
        .catch(() => undefined);
    }
  }

  // --- Photo edit processor (C-3B) -----------------------------------------
  // Same discipline as the craft render processor — only here, only when
  // configured — with the binary (PHOTOCRAFT_BIN) as the gate. An edit
  // claimed while storage is unconfigured fails at claim time with
  // STORAGE_NOT_CONFIGURED (never hangs); with no binary, no edit can even
  // be created — the photo surface answers PHOTO_NOT_CONFIGURED.
  let photoProcessor: { stop(): Promise<void> } | null = null;
  if (process.env['PHOTO_EDIT_PROCESSOR_DISABLED'] === '1') {
    app.log.info('PHOTO_EDIT_PROCESSOR_DISABLED: disabled by PHOTO_EDIT_PROCESSOR_DISABLED=1');
  } else {
    const { resolvePhotoCraftBin, NodePhotoCraftRunner, editTimeoutFromEnv, PINNED_PHOTOCRAFT } =
      await import('./services/photocraft.adapter.js');
    const bin = resolvePhotoCraftBin();
    if (!bin) {
      app.log.info(
        'PHOTO_EDIT_PROCESSOR_DISABLED: PHOTOCRAFT_BIN is unset or not executable — photo edits cannot be created',
      );
    } else {
      const { buildStoragePort } = await import('./services/storage.adapter.js');
      const { PhotoEditService } = await import('./services/photo-edit.service.js');
      const { PhotoEditProcessor } = await import('./services/photo-edit-processor.js');
      const { AssetService } = await import('./services/asset.service.js');
      const { adaptPhotoPrisma } = await import('./services/job-delegate-adapters.js');

      const prisma = (app as unknown as { prisma: never }).prisma;
      const storage = buildStoragePort();
      const runner = new NodePhotoCraftRunner(bin, editTimeoutFromEnv());
      const instance = new PhotoEditProcessor({
        // CP-1 fold-in: persistence on EditJob via the PHOTO_EDIT adapter.
        service: new PhotoEditService(adaptPhotoPrisma(prisma), storage, runner),
        assets: new AssetService(prisma, storage),
        runner,
        storage,
        logger: {
          info: (msg: string) => app.log.info(msg),
          error: (msg: string) => app.log.error(msg),
        },
      });
      await instance.start();
      photoProcessor = instance;
      app.log.info(
        `PHOTO_EDIT_PROCESSOR_ENABLED: polling EditJob (kind PHOTO_EDIT); companion ${bin} (pinned ${PINNED_PHOTOCRAFT.version})`,
      );
      // Pin-change alarm (C-2 pattern): a detected version other than the
      // pin is logged loudly, never silently accepted.
      runner
        .probeVersion()
        .then((detected) => {
          if (!detected.includes(PINNED_PHOTOCRAFT.version)) {
            app.log.warn(
              `PHOTOCRAFT VERSION MISMATCH: detected "${detected}", pinned ${PINNED_PHOTOCRAFT.version} — treat as a pin change, do not ignore`,
            );
          }
        })
        .catch(() => undefined);
    }
  }

  // --- Design processor (C-7 step 4) ---------------------------------------
  // Same discipline as the craft/photo processors — only here, only when
  // configured — with the binary (FIGCRAFT_BIN) as the gate. A design job
  // claimed while storage is unconfigured fails at claim time with
  // STORAGE_NOT_CONFIGURED (never hangs); with no binary, no design job
  // can even be created — the design tools answer FIGCRAFT_NOT_CONFIGURED.
  // Design jobs live on the unified EditJob table (kind DESIGN) via
  // JobService — no delegate adapter, no dedicated table.
  let designProcessor: { stop(): Promise<void> } | null = null;
  if (process.env['DESIGN_PROCESSOR_DISABLED'] === '1') {
    app.log.info('DESIGN_PROCESSOR_DISABLED: disabled by DESIGN_PROCESSOR_DISABLED=1');
  } else {
    const { resolveFigCraftBin, NodeFigCraftRunner, designTimeoutFromEnv, PINNED_FIGCRAFT } =
      await import('./services/figcraft.adapter.js');
    const bin = resolveFigCraftBin();
    if (!bin) {
      app.log.info(
        'DESIGN_PROCESSOR_DISABLED: FIGCRAFT_BIN is unset or not executable — design jobs cannot be created',
      );
    } else {
      const { buildStoragePort } = await import('./services/storage.adapter.js');
      const { DesignService } = await import('./services/design.service.js');
      const { DesignProcessor } = await import('./services/design-processor.js');
      const { AssetService } = await import('./services/asset.service.js');

      const prisma = (app as unknown as { prisma: never }).prisma;
      const storage = buildStoragePort();
      const runner = new NodeFigCraftRunner(bin, designTimeoutFromEnv());
      const instance = new DesignProcessor({
        service: new DesignService(prisma, storage, runner),
        assets: new AssetService(prisma, storage),
        runner,
        storage,
        logger: {
          info: (msg: string) => app.log.info(msg),
          error: (msg: string) => app.log.error(msg),
        },
      });
      await instance.start();
      designProcessor = instance;
      app.log.info(
        `DESIGN_PROCESSOR_ENABLED: polling EditJob (kind DESIGN); companion ${bin} (pinned ${PINNED_FIGCRAFT.version})`,
      );
      // Pin-change alarm (C-2 pattern): a detected version other than the
      // pin is logged loudly, never silently accepted.
      runner
        .probeVersion()
        .then((detected) => {
          if (!detected.includes(PINNED_FIGCRAFT.version)) {
            app.log.warn(
              `FIGCRAFT VERSION MISMATCH: detected "${detected}", pinned ${PINNED_FIGCRAFT.version} — treat as a pin change, do not ignore`,
            );
          }
        })
        .catch(() => undefined);
    }
  }

  // --- QuantCooks MCP gateway (CP-1 wiring, §9.5 flag) ---------------------
  // Wired here and ONLY here, behind QUANTCOOKS_MCP_ENABLED=1 (default
  // off): the wiring exists, but the external surface stays CLOSED until
  // CP-3 ships delegation verification and CP-4 the SSO token grant —
  // no tokens can be issued in CP-1, and the bridge's agent-claiming
  // invokes refuse with DELEGATION_NOT_CONFIGURED regardless. The mount
  // path is the gateway's Streamable HTTP endpoint; the public URL it is
  // reached at is configuration (QUANTCOOKS_PUBLIC_MCP_URL), never code.
  if (process.env['QUANTCOOKS_MCP_ENABLED'] === '1') {
    const { mountQuantCooksMcp, quantCooksMcpPublicUrl } = await import('./tools/mcp.js');
    const { buildStoragePort } = await import('./services/storage.adapter.js');
    const prisma = (app as unknown as { prisma: never }).prisma;
    await mountQuantCooksMcp(app, { prisma, storage: buildStoragePort() });
    app.log.info(
      `QUANTCOOKS_MCP_ENABLED: gateway mounted at /mcp (public URL: ${quantCooksMcpPublicUrl()}); no token issuance until CP-3/CP-4 — delegated invokes refuse DELEGATION_NOT_CONFIGURED`,
    );
  } else {
    app.log.info(
      'QUANTCOOKS_MCP_DISABLED: QUANTCOOKS_MCP_ENABLED is not 1 — the MCP gateway stays unmounted until CP-4',
    );
  }

  await app.listen({ port: config.port, host: config.host });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    try {
      if (processor) await processor.stop();
      if (craftProcessor) await craftProcessor.stop();
      if (photoProcessor) await photoProcessor.stop();
      if (designProcessor) await designProcessor.stop();
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error, signal }, 'shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('quantedits backend failed to start', err);
  process.exit(1);
});
