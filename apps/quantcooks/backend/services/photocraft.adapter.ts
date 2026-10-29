// ============================================================================
// QuantCooks - PhotoCraft companion adapter (C-3B)
// ============================================================================
//
// The QuantAI-control half of checklist row #80. C-3 proved the PhotoCraft
// WEB build has no control surface at all (no postMessage, no control
// server; save = browser downloads only), but the desktop line ships a CLI
// with a 945-command registry — verified headless in this repo's Phase-1
// spike (~/workspace/quantcooks-craft-spike/photocraft-cli/NOTES.md):
//
//  - photocraft-cli 0.17.0 runs in this VM; `run <file> --cmd <id>
//    --params <json> [--cmd ...] --out <file>` edits one-shot, no server.
//  - A real round trip landed: 64x48 PNG -> imageSize 32x24 +
//    brightnessContrast + flip -> verified dims/pixels; PSD export carries
//    the '8BPS' magic; MCP handshake passed (not used by this adapter).
//  - Unknown command -> exit 1 with a named stderr error; missing input ->
//    stderr I/O error, no output written.
//
// This adapter is the C-2 EffectCraft adapter's sibling: env-only binary
// location, validation BEFORE any spawn, arg-array spawning (never a shell
// string), timeout + kill, stderr tail, and finalize honesty rules:
//
//  - timed out                -> FAILED PHOTO_TIMEOUT
//  - exit != 0                -> FAILED PHOTO_EXIT_<code> + stderr tail
//  - exit == 0 but no output  -> FAILED EDIT_NO_OUTPUT (never faked)
//  - exit == 0 and output     -> COMPLETED
//
// OPERATIONS ALLOWLIST: a job's operations[] may only name commands in
// PHOTO_OPERATIONS below — every entry was run headless against the pinned
// binary in Phase 1 with its effect verified, and each entry's param rules
// mirror the binary's own `commands --json` parameter docs (ranges
// included). Anything else (unknown id, unknown param key, out-of-range
// value) is rejected before any spawn. Deliberate exclusions: the
// `profile` param of image.mode.grayscale (a filesystem path), all layer/
// type/selection commands (multi-step authoring state, not one-shot ops),
// and file.* commands (the processor owns the file lifecycle).
//
// The companion binary is a black box: invoked, never embedded, never
// rebranded. Upstream is dual-licensed MIT OR Apache-2.0 (LICENSE-MIT +
// LICENSE-APACHE + NOTICE ship inside its release tarball and stay with the
// installed binary — see PINNED_PHOTOCRAFT below). Upstream name/wordmark
// are trademarks NOT covered by that license: no QuantCooks UI, asset or
// output carries upstream branding; this module is internal plumbing.
// ============================================================================

import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants, existsSync } from 'node:fs';

/** Companion-service manifest for the pinned upstream release (Phase 1). */
export const PINNED_PHOTOCRAFT = Object.freeze({
  version: '0.17.0',
  tag: 'v0.17.0',
  publishedAt: '2026-10-28',
  // There is NO standalone Linux CLI asset in v0.17.0 (only a macOS CLI
  // zip). The Linux app tarball ships bin/photocraft-cli next to
  // bin/photocraft — the same shape as EffectCraft v0.18.0.
  linuxAsset: 'photocraft-0.17.0-linux-x86_64.tar.gz',
  linuxAssetUrl:
    'https://github.com/storytold/photocraft/releases/download/v0.17.0/photocraft-0.17.0-linux-x86_64.tar.gz',
  linuxAssetSha256: '5259f9c428c8ee3478c35500ece98713561cafc050e4c9eb354a5050f36eb2b8',
  cliPathInTarball: 'photocraft-0.17.0-linux-x86_64/bin/photocraft-cli',
  sumsAsset: 'SHA256SUMS.txt',
  /** Total command ids in the pinned binary's registry (`commands`). */
  registryCommandCount: 945,
});

// ---------------------------------------------------------------------------
// Operations allowlist (every entry Phase-1 verified — see header)
// ---------------------------------------------------------------------------

export interface PhotoOperation {
  id: string;
  params?: Record<string, unknown>;
}

type ParamRule =
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'boolean' }
  | { type: 'string'; enum: readonly string[] };

export interface PhotoOpSpec {
  /** Param name -> rule. A param not listed here is rejected. */
  params: Record<string, ParamRule>;
}

const num = (min?: number, max?: number, integer = false): ParamRule => ({
  type: 'number',
  min,
  max,
  integer,
});
const px = (min = 1, max = 100_000): ParamRule => num(min, max, true);
const bool = (): ParamRule => ({ type: 'boolean' });
const oneOf = (values: readonly string[]): ParamRule => ({ type: 'string', enum: values });

/** The verified one-shot operations a photo-edit job may run, in order. */
export const PHOTO_OPERATIONS: Record<string, PhotoOpSpec> = {
  'image.imageSize': {
    params: {
      width: px(),
      height: px(),
      percent: num(0.01, 10_000),
      resample: oneOf([
        'automatic',
        'preserveDetails',
        'bicubicSmoother',
        'bicubicSharper',
        'bicubicAutomatic',
        'bicubic',
        'nearest',
        'bilinear',
        'lanczos',
        'none',
      ]),
    },
  },
  'image.canvasSize': {
    params: {
      width: px(),
      height: px(),
      relative: bool(),
      anchor: oneOf([
        'topLeft',
        'top',
        'topRight',
        'left',
        'center',
        'right',
        'bottomLeft',
        'bottom',
        'bottomRight',
      ]),
    },
  },
  'image.crop': {
    params: { x: px(0), y: px(0), width: px(), height: px() },
  },
  'image.trim': {
    params: {
      basedOn: oneOf(['transparent', 'topLeft', 'bottomRight']),
      top: bool(),
      bottom: bool(),
      left: bool(),
      right: bool(),
    },
  },
  'image.imageRotation.flipCanvasHorizontal': { params: {} },
  'image.imageRotation.flipCanvasVertical': { params: {} },
  'image.imageRotation.180': { params: {} },
  'image.imageRotation.90cw': { params: {} },
  'image.imageRotation.90ccw': { params: {} },
  'image.adjustments.brightnessContrast': {
    params: { brightness: num(-150, 150), contrast: num(-50, 100), legacy: bool() },
  },
  'image.adjustments.hueSaturation': {
    params: {
      hue: num(-180, 180),
      saturation: num(-100, 100),
      lightness: num(-100, 100),
      colorize: bool(),
    },
  },
  'image.adjustments.exposure': {
    params: { exposure: num(-20, 20), offset: num(-0.5, 0.5), gamma: num(0.01, 9.99) },
  },
  'image.adjustments.vibrance': {
    params: { vibrance: num(-100, 100), saturation: num(-100, 100) },
  },
  'image.adjustments.invert': { params: {} },
  'image.adjustments.desaturate': { params: {} },
  'image.mode.grayscale': {
    params: {
      intent: oneOf(['perceptual', 'relative', 'saturation', 'absolute']),
      bpc: bool(),
    },
  },
  'filter.blur.gaussianBlur': { params: { radius: num(0.1, 1000) } },
  'filter.sharpen.unsharpMask': {
    params: { amount: num(1, 500), radius: num(0.1, 1000), threshold: num(0, 255) },
  },
  'filter.sharpen.sharpen': { params: {} },
};

/** Max operations per job — a bounded, reviewable edit script. */
export const MAX_PHOTO_OPERATIONS = 32;

/**
 * Validate an operations list against the allowlist (pure). Returns the
 * list of problems; empty means runnable. This is the ONLY gate between a
 * caller's operation ids and the binary — it runs at job creation and
 * again inside editWithPhotoCraft before any spawn.
 */
export function validateOperations(ops: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(ops)) {
    return { ok: false, errors: ['operations must be an array'] };
  }
  if (ops.length === 0) {
    errors.push('operations must contain at least one operation');
  }
  if (ops.length > MAX_PHOTO_OPERATIONS) {
    errors.push(`operations exceeds the maximum of ${MAX_PHOTO_OPERATIONS} per job`);
  }
  ops.forEach((op, i) => {
    const at = `operations[${i}]`;
    if (!op || typeof op !== 'object' || Array.isArray(op)) {
      errors.push(`${at} must be an object { id, params? }`);
      return;
    }
    const rec = op as Record<string, unknown>;
    const id = rec['id'];
    if (typeof id !== 'string' || !id) {
      errors.push(`${at}.id must be a non-empty string`);
      return;
    }
    const spec = PHOTO_OPERATIONS[id];
    if (!spec) {
      errors.push(`${at}.id "${id}" is not in the verified operations allowlist`);
      return;
    }
    const params = rec['params'] ?? {};
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      errors.push(`${at}.params must be an object`);
      return;
    }
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      const rule = spec.params[key];
      if (!rule) {
        errors.push(`${at} param "${key}" is not allowlisted for ${id}`);
        continue;
      }
      if (rule.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`${at} param "${key}" must be a number`);
        } else if (rule.integer && !Number.isInteger(value)) {
          errors.push(`${at} param "${key}" must be an integer`);
        } else if (rule.min != null && value < rule.min) {
          errors.push(`${at} param "${key}" must be >= ${rule.min}`);
        } else if (rule.max != null && value > rule.max) {
          errors.push(`${at} param "${key}" must be <= ${rule.max}`);
        }
      } else if (rule.type === 'boolean') {
        if (typeof value !== 'boolean') {
          errors.push(`${at} param "${key}" must be a boolean`);
        }
      } else if (rule.type === 'string') {
        if (typeof value !== 'string' || !rule.enum.includes(value)) {
          errors.push(`${at} param "${key}" must be one of ${rule.enum.join('|')}`);
        }
      }
    }
  });
  return { ok: errors.length === 0, errors };
}

/**
 * Build the CLI argv for one headless edit (pure). Verified form (Phase 1):
 * `run <in> --cmd <id> --params <json> [--cmd ...] --out <out>` — --params
 * binds to the --cmd BEFORE it. Arg-array only; the runner spawns without a
 * shell, so no operation id or param value can become shell syntax.
 */
export function buildRunArgs(input: {
  inputPath: string;
  operations: PhotoOperation[];
  outputPath: string;
}): string[] {
  if (!input.inputPath) throw new Error('inputPath is required');
  if (!input.outputPath) throw new Error('outputPath is required');
  const args = ['run', input.inputPath];
  for (const op of input.operations) {
    args.push('--cmd', op.id);
    if (op.params && Object.keys(op.params).length > 0) {
      args.push('--params', JSON.stringify(op.params));
    }
  }
  args.push('--out', input.outputPath);
  return args;
}

export type FinalizeEditOutcome =
  | { status: 'COMPLETED'; outputPath: string }
  | { status: 'FAILED'; error: string };

/**
 * Decide an edit's terminal outcome after the process exits (pure). The
 * C-2 honesty rules, unchanged — success is never faked.
 */
export function finalizeEdit(input: {
  exitCode: number | null;
  timedOut: boolean;
  outputPath: string;
  outputExists: boolean;
  stderrTail: string;
}): FinalizeEditOutcome {
  if (input.timedOut) {
    return {
      status: 'FAILED',
      error: `PHOTO_TIMEOUT: edit exceeded its time budget${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (input.exitCode !== 0) {
    return {
      status: 'FAILED',
      error: `PHOTO_EXIT_${input.exitCode ?? 'SIGNAL'}${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (!input.outputExists) {
    return {
      status: 'FAILED',
      error: 'EDIT_NO_OUTPUT: CLI exited 0 but produced no output file',
    };
  }
  return { status: 'COMPLETED', outputPath: input.outputPath };
}

/**
 * Runner interface (the C-2 seam):
 *   run(argv, { onStdoutLine, onStderrLine }) -> { exitCode, stderrTail, timedOut }
 */
export interface PhotoCraftRunner {
  run(
    argv: string[],
    options?: {
      onStdoutLine?: (line: string) => void;
      onStderrLine?: (line: string) => void;
    },
  ): Promise<{ exitCode: number | null; stderrTail: string; timedOut: boolean }>;
}

const DEFAULT_EDIT_TIMEOUT_MS = 10 * 60 * 1000;
const STDERR_TAIL_LINES = 20;

export function editTimeoutFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env['PHOTOCRAFT_EDIT_TIMEOUT_MS']);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EDIT_TIMEOUT_MS;
}

/** Real runner: spawns the pinned companion CLI with an argv array (no
 *  shell), streams output lines, and enforces a timeout (SIGTERM, then
 *  SIGKILL after a grace period). */
export class NodePhotoCraftRunner implements PhotoCraftRunner {
  constructor(
    private readonly binPath: string,
    private readonly timeoutMs: number = editTimeoutFromEnv(),
  ) {}

  run(
    argv: string[],
    options: {
      onStdoutLine?: (line: string) => void;
      onStderrLine?: (line: string) => void;
    } = {},
  ): Promise<{ exitCode: number | null; stderrTail: string; timedOut: boolean }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
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

      const pump = (
        stream: NodeJS.ReadableStream,
        onLine?: (line: string) => void,
        keepTail = false,
      ) => {
        stream.setEncoding('utf8');
        let buf = '';
        stream.on('data', (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (keepTail) {
              tail.push(line);
              if (tail.length > STDERR_TAIL_LINES) tail.shift();
            }
            onLine?.(line);
          }
        });
      };
      // stdout carries the per-command JSON results; drain it (a full pipe
      // must never block the CLI) and forward lines to the caller.
      pump(child.stdout, options.onStdoutLine);
      pump(child.stderr, options.onStderrLine, true);

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

  /** `photocraft-cli --version` — boot logging and the gated IT. */
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
 * (PHOTOCRAFT_BIN). Returns null when unset, missing, or not executable:
 * the caller treats null as PHOTO_NOT_CONFIGURED and fails closed. The
 * binary is never vendored into or downloaded by this codebase.
 */
export function resolvePhotoCraftBin(env: NodeJS.ProcessEnv = process.env): string | null {
  const bin = env['PHOTOCRAFT_BIN'];
  if (!bin) return null;
  try {
    accessSync(bin, fsConstants.X_OK);
    return bin;
  } catch {
    return null;
  }
}

/** Build the production runner, or null when the companion is not configured. */
export function buildPhotoCraftRunner(env: NodeJS.ProcessEnv = process.env): NodePhotoCraftRunner | null {
  const bin = resolvePhotoCraftBin(env);
  if (!bin) return null;
  return new NodePhotoCraftRunner(bin, editTimeoutFromEnv(env));
}

export interface EditWithPhotoCraftInput {
  inputPath: string;
  outputPath: string;
  operations: PhotoOperation[];
  runner: PhotoCraftRunner;
  fileExists?: (path: string) => boolean;
}

/**
 * Orchestrate one headless edit: validate the operations against the
 * allowlist BEFORE any spawn (an invalid list never reaches the binary),
 * build argv, run, finalize by the honesty rules.
 */
export async function editWithPhotoCraft(
  input: EditWithPhotoCraftInput,
): Promise<FinalizeEditOutcome> {
  const validation = validateOperations(input.operations);
  if (!validation.ok) {
    return {
      status: 'FAILED',
      error: `INVALID_OPERATIONS: ${validation.errors.join('; ')}`,
    };
  }

  const fileExists = input.fileExists ?? existsSync;
  const argv = buildRunArgs({
    inputPath: input.inputPath,
    operations: input.operations,
    outputPath: input.outputPath,
  });

  const { exitCode, stderrTail, timedOut } = await input.runner.run(argv);

  return finalizeEdit({
    exitCode,
    timedOut,
    outputPath: input.outputPath,
    outputExists: fileExists(input.outputPath),
    stderrTail,
  });
}
