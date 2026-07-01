// ============================================================================
// QuantEdits - Daily auto-edit -> auto-post E2E orchestration
// ============================================================================
//
// The founder-vision "5AM auto-edit -> post" loop, made durable and honest:
//   select-source -> render -> meter credits -> schedule/post -> report.
//
// Each step appends a checkpoint to a durable AutoEditRun; the run is idempotent
// per (user, UTC day) via the unique key, so a duplicate cron fire never
// double-posts. Rendering and publishing go through PLUGGABLE ports so the whole
// orchestration is sandbox-verifiable WITHOUT a fake render: the default
// NullRenderer FAILS CLOSED (RENDER_NOT_CONFIGURED) and the run is honestly
// marked failed at the render step — never a fabricated success. Real WASM-ffmpeg
// rendering + live social posting are wired in staging (needs-staging).

import { createAppError } from '@quant/server-core';

// ---- Pluggable ports --------------------------------------------------------

export interface RenderInput {
  userId: string;
  sourceRef: string;
  templateId?: string;
}
export interface RenderResult {
  ok: boolean;
  outputUrl?: string;
  error?: string;
}
export interface RenderPort {
  render(input: RenderInput): Promise<RenderResult>;
}

/** Default renderer: fails closed until a real render backend is configured. */
export class NullRenderer implements RenderPort {
  async render(): Promise<RenderResult> {
    return { ok: false, error: 'RENDER_NOT_CONFIGURED' };
  }
}

export interface PublishInput {
  userId: string;
  outputUrl: string;
  caption?: string;
}
export interface PublishResult {
  ok: boolean;
  postId?: string;
  error?: string;
}
export interface PublishPort {
  publish(input: PublishInput): Promise<PublishResult>;
}

/** Default publisher: no dispatcher wired -> honest failure (no fake post). */
export class NullPublisher implements PublishPort {
  async publish(): Promise<PublishResult> {
    return { ok: false, error: 'PUBLISH_NOT_CONFIGURED' };
  }
}

/** Meters credits for a run. Wired to @quant/credits (or app wallet) at boot. */
export interface CreditsPort {
  debit(userId: string, credits: number, idempotencyKey: string): Promise<void>;
}

/** Picks the source clip(s) to edit for a user (assets, latest upload, etc). */
export interface SourceSelectorPort {
  selectSource(userId: string): Promise<string | null>;
}

// ---- Durable run shape ------------------------------------------------------

export interface RunCheckpoint {
  step: string;
  status: 'completed' | 'failed';
  detail?: string;
  at: string;
}

export interface AutoEditRunRow {
  id: string;
  userId: string;
  utcDay: string;
  status: string;
  currentStep: number;
  checkpoints: unknown;
  sourceRef: string | null;
  outputUrl: string | null;
  postId: string | null;
  creditsCharged: number;
  error: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
}

export interface AutoEditPrisma {
  autoEditRun: {
    findUnique(args: {
      where: { userId_utcDay: { userId: string; utcDay: string } };
    }): Promise<AutoEditRunRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<AutoEditRunRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<AutoEditRunRow>;
  };
}

export interface AutoEditRunSummary {
  id: string;
  userId: string;
  utcDay: string;
  status: 'completed' | 'failed';
  outputUrl: string | null;
  postId: string | null;
  creditsCharged: number;
  checkpoints: RunCheckpoint[];
  error?: string;
}

export interface AutoEditOrchestratorOptions {
  renderer?: RenderPort;
  publisher?: PublishPort;
  credits?: CreditsPort;
  sourceSelector?: SourceSelectorPort;
  /** Credits charged per successful auto-edit render+post. Default 10. */
  creditsPerRun?: number;
  now?: () => Date;
  generateId?: () => string;
}

const UTC_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AutoEditOrchestrator {
  private readonly renderer: RenderPort;
  private readonly publisher: PublishPort;
  private readonly credits: CreditsPort | undefined;
  private readonly sourceSelector: SourceSelectorPort | undefined;
  private readonly creditsPerRun: number;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(
    private readonly prisma: AutoEditPrisma,
    options: AutoEditOrchestratorOptions = {},
  ) {
    this.renderer = options.renderer ?? new NullRenderer();
    this.publisher = options.publisher ?? new NullPublisher();
    this.credits = options.credits;
    this.sourceSelector = options.sourceSelector;
    this.creditsPerRun = options.creditsPerRun ?? 10;
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /**
   * Run the daily auto-edit pipeline for a user. Idempotent per (user, day):
   * a completed run is returned untouched (no double-post).
   */
  async runDaily(
    userId: string,
    options: { utcDay?: string; sourceRef?: string; templateId?: string; caption?: string } = {},
  ): Promise<AutoEditRunSummary> {
    if (!userId) throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    const day = options.utcDay ?? this.now().toISOString().slice(0, 10);
    if (!UTC_DAY_RE.test(day)) {
      throw createAppError('utcDay must be a YYYY-MM-DD UTC-day string', 400, 'INVALID_UTC_DAY');
    }

    // IDEMPOTENCY: a completed run for this user+day is never reprocessed.
    const existing = await this.prisma.autoEditRun.findUnique({
      where: { userId_utcDay: { userId, utcDay: day } },
    });
    if (existing && existing.status === 'completed') {
      return this.toSummary(existing);
    }

    const run =
      existing ??
      (await this.prisma.autoEditRun.create({
        data: { id: this.generateId(), userId, utcDay: day, status: 'running' },
      }));

    const checkpoints: RunCheckpoint[] = [];
    const fail = async (step: string, error: string): Promise<AutoEditRunSummary> => {
      checkpoints.push({ step, status: 'failed', detail: error, at: this.now().toISOString() });
      const row = await this.prisma.autoEditRun.update({
        where: { id: run.id },
        data: { status: 'failed', checkpoints, error, finishedAt: this.now() },
      });
      return this.toSummary(row);
    };
    const ok = (step: string, detail?: string): void => {
      checkpoints.push({
        step,
        status: 'completed',
        ...(detail ? { detail } : {}),
        at: this.now().toISOString(),
      });
    };

    // 1) SELECT SOURCE
    const sourceRef =
      options.sourceRef ??
      (this.sourceSelector ? await this.sourceSelector.selectSource(userId) : null);
    if (!sourceRef) {
      return fail('select_source', 'NO_SOURCE_AVAILABLE');
    }
    ok('select_source', sourceRef);

    // 2) RENDER (pluggable; NullRenderer fails closed = needs-staging)
    const rendered = await this.renderer.render({
      userId,
      sourceRef,
      ...(options.templateId ? { templateId: options.templateId } : {}),
    });
    if (!rendered.ok || !rendered.outputUrl) {
      return fail('render', rendered.error ?? 'RENDER_FAILED');
    }
    ok('render', rendered.outputUrl);

    // 3) METER CREDITS (idempotent by run id)
    if (this.credits) {
      try {
        await this.credits.debit(userId, this.creditsPerRun, `auto-edit:${run.id}`);
        ok('meter', String(this.creditsPerRun));
      } catch (err) {
        return fail('meter', err instanceof Error ? err.message : 'CREDITS_FAILED');
      }
    }

    // 4) PUBLISH (pluggable; NullPublisher fails closed)
    const published = await this.publisher.publish({
      userId,
      outputUrl: rendered.outputUrl,
      ...(options.caption ? { caption: options.caption } : {}),
    });
    if (!published.ok || !published.postId) {
      return fail('publish', published.error ?? 'PUBLISH_FAILED');
    }
    ok('publish', published.postId);

    // 5) REPORT
    const finished = await this.prisma.autoEditRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        checkpoints,
        sourceRef,
        outputUrl: rendered.outputUrl,
        postId: published.postId,
        creditsCharged: this.credits ? this.creditsPerRun : 0,
        finishedAt: this.now(),
      },
    });
    return this.toSummary(finished);
  }

  private toSummary(row: AutoEditRunRow): AutoEditRunSummary {
    const checkpoints = Array.isArray(row.checkpoints) ? (row.checkpoints as RunCheckpoint[]) : [];
    return {
      id: row.id,
      userId: row.userId,
      utcDay: row.utcDay,
      status: row.status === 'completed' ? 'completed' : 'failed',
      outputUrl: row.outputUrl,
      postId: row.postId,
      creditsCharged: row.creditsCharged,
      checkpoints,
      ...(row.error ? { error: row.error } : {}),
    };
  }
}
