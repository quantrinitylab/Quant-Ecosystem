// ============================================================================
// QuantCooks - EffectCraft companion adapter (C-2)
// ============================================================================
//
// TypeScript port of the C-2 spike's proven adapter sketch
// (~/workspace/quantcooks-craft-spike/effectcraft-adapter.mjs, 14/14 tests
// there), hardened per the spike report's §5 step 2: timeout + process kill
// in the real runner, stderr-tail capture, structural .ecproj validation
// BEFORE any spawn. The finalize honesty rules are the spike's, unchanged:
//
//  - exit != 0                    -> FAILED, error EFFECTCRAFT_EXIT_<code>
//  - exit == 0 but no output file -> FAILED 'RENDER_NO_OUTPUT' (never faked)
//  - exit == 0 and output exists  -> COMPLETED
//
// The companion binary is a black box: invoked, never embedded, never
// rebranded. Upstream is dual-licensed MIT OR Apache-2.0 (LICENSE-MIT +
// LICENSE-APACHE + NOTICE ship inside its release tarball and stay with the
// installed binary — see PINNED_EFFECTCRAFT below). Upstream name/wordmark
// are trademarks NOT covered by that license: no QuantCooks UI, asset or
// output carries upstream branding; this module is internal plumbing.
//
// PIN (spike §1, verified 2026-10-29 against the release's own
// SHA256SUMS.txt): v0.18.0. There is NO standalone Linux CLI asset — the CLI
// ships inside the app tarball at bin/effectcraft-cli; an install step
// (ops, not this codebase) downloads the tarball, verifies the sha256 below,
// extracts only that member, and points EFFECTCRAFT_BIN at it. This module
// NEVER downloads or vendors the binary.
//
// TICKS GOTCHA (spike §2, verified arithmetically): .ecproj comp/layer time
// fields are TICKS at 254,016,000,000 per second; the CLI/MCP surfaces speak
// seconds. Documents must come from the binary's own surfaces (CLI exec /
// templates / MCP) — validateEcproj below is a structural gate, not a full
// schema, and it rejects the one corruption it can honestly detect: a comp
// duration so small it can only be hand-written seconds.
// ============================================================================

import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Companion-service manifest for the pinned upstream release (spike §1). */
export const PINNED_EFFECTCRAFT = Object.freeze({
  version: '0.18.0',
  tag: 'v0.18.0',
  publishedAt: '2026-10-28T17:38:55Z',
  // There is NO standalone Linux CLI asset in v0.18.0 (only a macOS CLI zip).
  // The Linux tarball ships bin/effectcraft-cli next to bin/effectcraft.
  linuxAsset: 'effectcraft-0.18.0-linux-x86_64.tar.gz',
  linuxAssetUrl:
    'https://github.com/storytold/effectcraft/releases/download/v0.18.0/effectcraft-0.18.0-linux-x86_64.tar.gz',
  linuxAssetSha256: '94d1d85691d54ba57fa86e04872fbcc426c33d1bd364f1fc976b1f607344880b',
  cliPathInTarball: 'effectcraft-0.18.0-linux-x86_64/bin/effectcraft-cli',
  sumsAsset: 'SHA256SUMS.txt',
});

/** .ecproj time unit: ticks per second (spike §2). */
export const ECPROJ_TICKS_PER_SECOND = 254_016_000_000;

/**
 * A comp duration below this many ticks (~4 ms) cannot be a real composition
 * — it is a hand-written seconds value (a 10 s comp written as `10` instead
 * of `2540160000000`). The validator rejects exactly that corruption class
 * and nothing broader; the binary stays the authority on everything deeper.
 */
const MIN_PLAUSIBLE_COMP_TICKS = 1_000_000;

export interface RenderArgsInput {
  projectPath: string;
  comp?: string;
  outputPath: string;
  format?: string;
  startSec?: number;
  endSec?: number;
  resolution?: string;
  quality?: string;
}

/**
 * Build the CLI argv for a headless render (pure). Verified form (spike §3.1,
 * run live against the pinned binary): `--progress` makes the CLI print
 * `progress <done> <total> <elapsed> <eta|->` lines on stderr when stderr is
 * not a terminal — exactly our pipe case.
 */
export function buildRenderArgs(input: RenderArgsInput): string[] {
  if (!input.projectPath) throw new Error('projectPath is required');
  if (!input.outputPath) throw new Error('outputPath is required');
  const args = ['--project', input.projectPath, 'render'];
  if (input.comp) args.push('--comp', String(input.comp));
  args.push('--out', input.outputPath);
  if (input.format) args.push('--format', input.format);
  if (input.startSec != null) args.push('--start', String(input.startSec));
  if (input.endSec != null) args.push('--end', String(input.endSec));
  if (input.resolution) args.push('--resolution', input.resolution);
  if (input.quality) args.push('--quality', input.quality);
  args.push('--progress');
  return args;
}

export type ProgressEvent =
  | {
      type: 'progress';
      done: number;
      total: number;
      elapsedSec: number;
      etaSec: number | null;
      percent: number;
    }
  | { type: 'done'; comp: string; outputPath: string; seconds: number };

const PROGRESS_RE = /^progress\s+(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+|-)\s*$/;
const DONE_RE = /^done:\s+(.+?)\s+→\s+(.+?)\s+in\s+([\d.]+)s\s*$/;

/**
 * Parse one stderr line from a render. Returns a progress/done event, or
 * null for anything else (headers, warnings, blank lines).
 */
export function parseProgressLine(line: unknown): ProgressEvent | null {
  if (typeof line !== 'string') return null;
  const t = line.trim();
  const p = PROGRESS_RE.exec(t);
  if (p) {
    const done = Number(p[1]);
    const total = Number(p[2]);
    return {
      type: 'progress',
      done,
      total,
      elapsedSec: Number(p[3]),
      etaSec: p[4] === '-' ? null : Number(p[4]),
      percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
    };
  }
  const d = DONE_RE.exec(t);
  if (d) {
    return { type: 'done', comp: d[1]!, outputPath: d[2]!, seconds: Number(d[3]) };
  }
  return null;
}

/**
 * Minimal structural validation of an .ecproj document (pure). Shape verified
 * against a real file written by the pinned binary itself (spike §2):
 * top level carries a numeric `schema` and an `items` map with at least one
 * item of kind.type 'Comp'. Comp/layer time fields, when present, must be
 * numbers (ticks) — a string or a seconds-scale duration is the hand-writing
 * corruption the ticks gotcha warns about, rejected here before any spawn.
 * This is a gate, not a full schema — the binary remains the authority and
 * fails closed on anything deeper.
 */
export function validateEcproj(doc: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: ['ecproj must be a JSON object'] };
  }
  const root = doc as Record<string, unknown>;
  if (typeof root['schema'] !== 'number') errors.push('missing numeric `schema`');
  const items = root['items'];
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    errors.push('missing object `items`');
  } else {
    const entries = Object.entries(items as Record<string, unknown>);
    const kinds = entries.map(
      ([, it]) => (it as { kind?: { type?: unknown } } | null)?.kind?.type,
    );
    if (!kinds.includes('Comp')) errors.push("no item with kind.type === 'Comp'");
    for (const [id, it] of entries) {
      if (!it || typeof it !== 'object') {
        errors.push(`item ${id} is not an object`);
        break;
      }
      const item = it as { kind?: Record<string, unknown> };
      if (!item.kind || typeof item.kind.type !== 'string') {
        errors.push(`item ${id} lacks kind.type`);
        break;
      }
      if (item.kind.type === 'Comp') {
        const duration = item.kind['duration'];
        if (duration !== undefined) {
          if (typeof duration !== 'number' || !Number.isFinite(duration)) {
            errors.push(`comp ${id} duration must be a number (ticks)`);
          } else if (duration > 0 && duration < MIN_PLAUSIBLE_COMP_TICKS) {
            errors.push(
              `comp ${id} duration ${duration} looks like seconds — .ecproj times are ticks (${ECPROJ_TICKS_PER_SECOND}/sec); generate the document via the CLI/templates, never hand-written`,
            );
          }
        }
        const layers = item.kind['layers'];
        if (Array.isArray(layers)) {
          for (const layer of layers) {
            const l = layer as Record<string, unknown> | null;
            if (!l || typeof l !== 'object') continue;
            for (const field of ['start_time', 'in_point', 'out_point'] as const) {
              const v = l[field];
              if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) {
                errors.push(`comp ${id} layer ${String(l['id'] ?? '?')} ${field} must be a number (ticks)`);
              }
            }
          }
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export type FinalizeOutcome =
  | { status: 'COMPLETED'; outputPath: string }
  | { status: 'FAILED'; error: string };

/**
 * Decide a render's terminal outcome after the process exits (pure).
 * Honest rules, mirroring the P0-4 export idiom — success is never faked:
 *  - timed out               -> FAILED EFFECTCRAFT_TIMEOUT
 *  - exit != 0               -> FAILED EFFECTCRAFT_EXIT_<code> + stderr tail
 *  - exit == 0, no output    -> FAILED RENDER_NO_OUTPUT
 *  - exit == 0, output exists -> COMPLETED
 */
export function finalizeRender(input: {
  exitCode: number | null;
  timedOut: boolean;
  outputPath: string;
  outputExists: boolean;
  stderrTail: string;
}): FinalizeOutcome {
  if (input.timedOut) {
    return {
      status: 'FAILED',
      error: `EFFECTCRAFT_TIMEOUT: render exceeded its time budget${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (input.exitCode !== 0) {
    return {
      status: 'FAILED',
      error: `EFFECTCRAFT_EXIT_${input.exitCode ?? 'SIGNAL'}${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (!input.outputExists) {
    return {
      status: 'FAILED',
      error: 'RENDER_NO_OUTPUT: CLI exited 0 but produced no output file',
    };
  }
  return { status: 'COMPLETED', outputPath: input.outputPath };
}

/**
 * Runner interface (the spike's seam):
 *   run(argv, { onStderrLine }) -> { exitCode, stderrTail, timedOut }
 * Implementations: NodeEffectCraftRunner (real), or a test fake.
 */
export interface EffectCraftRunner {
  run(
    argv: string[],
    options?: { onStderrLine?: (line: string) => void },
  ): Promise<{ exitCode: number | null; stderrTail: string; timedOut: boolean }>;
}

const DEFAULT_RENDER_TIMEOUT_MS = 15 * 60 * 1000;
const STDERR_TAIL_LINES = 20;

export function renderTimeoutFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env['EFFECTCRAFT_RENDER_TIMEOUT_MS']);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RENDER_TIMEOUT_MS;
}

/** Real runner: spawns the pinned companion CLI, streams stderr lines, and
 *  enforces a timeout (SIGTERM, then SIGKILL after a grace period). */
export class NodeEffectCraftRunner implements EffectCraftRunner {
  constructor(
    private readonly binPath: string,
    private readonly timeoutMs: number = renderTimeoutFromEnv(),
  ) {}

  run(
    argv: string[],
    options: { onStderrLine?: (line: string) => void } = {},
  ): Promise<{ exitCode: number | null; stderrTail: string; timedOut: boolean }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      const tail: string[] = [];
      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
        (killTimer as unknown as { unref?: () => void }).unref?.();
      }, this.timeoutMs);
      (timer as unknown as { unref?: () => void }).unref?.();

      // Drain stdout so a chatty CLI can never block on a full pipe.
      child.stdout?.resume();
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          tail.push(line);
          if (tail.length > STDERR_TAIL_LINES) tail.shift();
          options.onStderrLine?.(line);
        }
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        resolve({ exitCode: code, stderrTail: tail.join('\n'), timedOut });
      });
    });
  }

  /** `effectcraft-cli --version` — used by boot logging and the gated IT.
   *  (--version prints on stdout; run() drains stdout, hence a dedicated
   *  spawn here.) */
  async probeVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (c: string) => (out += c));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve(out.trim()) : reject(new Error(`--version exited ${code}`)),
      );
    });
  }
}

/**
 * Resolve the companion binary from env — the ONLY way it is located
 * (EFFECTCRAFT_BIN). Returns null when unset, missing, or not executable:
 * the caller treats null as CRAFT_NOT_CONFIGURED and fails closed. The
 * binary is never vendored into or downloaded by this codebase.
 */
export function resolveEffectCraftBin(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const bin = env['EFFECTCRAFT_BIN'];
  if (!bin) return null;
  try {
    accessSync(bin, fsConstants.X_OK);
    return bin;
  } catch {
    return null;
  }
}

/** Build the production runner, or null when the companion is not configured. */
export function buildEffectCraftRunner(env: NodeJS.ProcessEnv = process.env): NodeEffectCraftRunner | null {
  const bin = resolveEffectCraftBin(env);
  if (!bin) return null;
  return new NodeEffectCraftRunner(bin, renderTimeoutFromEnv(env));
}

export interface RenderWithEffectCraftInput {
  /** The parsed .ecproj document (written to a temp file), or a path to one. */
  ecprojJson?: unknown;
  ecprojPath?: string;
  comp?: string;
  outputPath: string;
  format?: string;
  startSec?: number;
  endSec?: number;
  resolution?: string;
  quality?: string;
  runner: EffectCraftRunner;
  fileExists?: (path: string) => boolean;
  onProgress?: (percent: number) => void;
}

/**
 * Orchestrate one render (the spike's renderWithEffectCraft, production
 * form): validate BEFORE any spawn, build argv, stream progress, finalize
 * by the honesty rules. Progress percent is the binary's own frames-done
 * ratio — a real event, never interpolated (CP-1 §5.5 names this wiring).
 */
export async function renderWithEffectCraft(
  input: RenderWithEffectCraftInput,
): Promise<FinalizeOutcome> {
  const fileExists = input.fileExists ?? existsSync;

  let projectPath = input.ecprojPath;
  if (input.ecprojJson != null) {
    const v = validateEcproj(input.ecprojJson);
    if (!v.ok) {
      return { status: 'FAILED', error: `INVALID_ECPROJ: ${v.errors.join('; ')}` };
    }
    const dir = mkdtempSync(join(tmpdir(), 'quantcooks-effectcraft-'));
    projectPath = join(dir, 'project.ecproj');
    writeFileSync(projectPath, JSON.stringify(input.ecprojJson));
  }
  if (!projectPath) throw new Error('ecprojJson or ecprojPath is required');

  const argv = buildRenderArgs({
    projectPath,
    comp: input.comp,
    outputPath: input.outputPath,
    format: input.format,
    startSec: input.startSec,
    endSec: input.endSec,
    resolution: input.resolution,
    quality: input.quality,
  });

  const { exitCode, stderrTail, timedOut } = await input.runner.run(argv, {
    onStderrLine: (line) => {
      const event = parseProgressLine(line);
      if (event?.type === 'progress') input.onProgress?.(event.percent);
    },
  });

  return finalizeRender({
    exitCode,
    timedOut,
    outputPath: input.outputPath,
    outputExists: fileExists(input.outputPath),
    stderrTail,
  });
}
