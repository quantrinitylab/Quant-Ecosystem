// ============================================================================
// QuantCooks - FigCraft companion adapter (C-7 step 4)
// ============================================================================
//
// The QuantAI-control half of the Design Studio (C-7). Steps 1–3 landed
// the human surface: the FigCraft WEB build served at
// /design-editor/0.12.1/ behind a probe-gated iframe. The C-7 spike
// (goal hidden_files/quantcooks-c7-figcraft-spike.md §2) proved three
// ways that the web build has NO agent/control surface at all — control
// rides the companion headless CLI against the document files:
//
//  - figcraft-cli 0.12.1 enumerates 615 commands; the headless `run`
//    mechanism built a real 224-node document from the `mobile-app`
//    template and saved it as a native .figcraft (a ZIP of
//    document.json + thumbnail.png), and `export` produced real
//    PNG/SVG/PDF bytes — all verified live in the spike VM.
//  - `run <script.json>` executes a JSON array of {command, params}
//    steps and prints one JSON result line per step on stdout; a
//    failing step prints {"ok":false,"error":...}, rolls the document
//    back atomically, and the process exits 1.
//  - --automation-read-root / --automation-write-root confine every
//    file the run touches to the per-job scratch dir; a save outside
//    the write root is refused by the binary itself.
//
// This adapter is the C-2/C-3B sibling: env-only binary location
// (FIGCRAFT_BIN), validation BEFORE any spawn, arg-array spawning
// (never a shell string), timeout + SIGTERM→SIGKILL, stderr tail, and
// finalize honesty rules:
//
//  - timed out                -> FAILED FIGCRAFT_TIMEOUT
//  - a run step reported ok:false -> FAILED FIGCRAFT_STEP_FAILED: <cmd>: <error>
//  - exit != 0                -> FAILED FIGCRAFT_EXIT_<code> + stderr tail
//  - exit == 0 but no output  -> FAILED DESIGN_NO_OUTPUT / EXPORT_NO_OUTPUT
//  - exit == 0 and output     -> COMPLETED (success is never faked)
//
// DOCUMENTS COME FROM THE BINARY, NEVER FROM US: a create script is
// exactly `file.newFromTemplate` (or `file.new` for a blank) followed
// by `file.saveAs` — the .figcraft bytes are whatever the pinned engine
// writes. This module never hand-writes document JSON.
//
// The companion binary is a black box: invoked, never embedded, never
// rebranded. Upstream is dual-licensed MIT OR Apache-2.0 (LICENSE-MIT +
// LICENSE-APACHE + NOTICE ship inside its release tarball and stay with
// the installed binary — see PINNED_FIGCRAFT below). Upstream name/
// wordmark are trademarks NOT covered by that license: no QuantCooks
// UI, asset or output carries upstream branding; this module is
// internal plumbing.
// ============================================================================

import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Companion-service manifest for the pinned upstream release (spike §0). */
export const PINNED_FIGCRAFT = Object.freeze({
  version: '0.12.1',
  tag: 'v0.12.1',
  publishedAt: '2026-10-28',
  // There is NO standalone Linux CLI asset in v0.12.1 (only a macOS CLI
  // zip). The Linux app tarball ships bin/figcraft-cli next to
  // bin/figcraft — the same packaging shape as EffectCraft v0.18.0.
  linuxAsset: 'figcraft-0.12.1-linux-x86_64.tar.gz',
  linuxAssetUrl:
    'https://github.com/storytold/figcraft/releases/download/v0.12.1/figcraft-0.12.1-linux-x86_64.tar.gz',
  linuxAssetSha256: '00a29f4cc382807d840f5d3e9b59f4c8829356789afbb956a0964918295e49dd',
  cliPathInTarball: 'figcraft-0.12.1-linux-x86_64/bin/figcraft-cli',
  sumsAsset: 'SHA256SUMS.txt',
  /** Total command ids in the pinned binary's registry (`commands`). */
  registryCommandCount: 615,
});

// ---------------------------------------------------------------------------
// Templates (the binary's own starter set — `template.list`, spike §2.2)
// ---------------------------------------------------------------------------
//
// These ids are the pinned engine's starter templates, enumerated by
// its own `template.list` command in the spike. They are the ONLY
// template ids a create job may name: anything else is refused before
// any spawn (the binary would refuse it too, one layer later, with a
// rolled-back script — the allowlist keeps the refusal cheap and the
// error ours). QuantCooks' own original template set is a content
// decision for a later unit; until then the engine's starters are the
// mechanism, stated as such.
export const FIGCRAFT_TEMPLATES = [
  'mobile-app',
  'landing-page',
  'dashboard',
  'design-system',
  'wireframe-kit',
  'social-posts',
  'slides',
  'icon-set',
] as const;

export type FigcraftTemplate = (typeof FIGCRAFT_TEMPLATES)[number];

/** Validate a template id against the pinned binary's starter set (pure). */
export function validateTemplateId(template: unknown): { ok: boolean; errors: string[] } {
  if (template === undefined || template === null) return { ok: true, errors: [] };
  if (typeof template !== 'string' || !(FIGCRAFT_TEMPLATES as readonly string[]).includes(template)) {
    return {
      ok: false,
      errors: [
        `template must be one of ${FIGCRAFT_TEMPLATES.join('|')} (the pinned engine's starter set)`,
      ],
    };
  }
  return { ok: true, errors: [] };
}

/** Export formats the design surface lands (spike §2.2: all three proven). */
export const DESIGN_EXPORT_FORMATS = ['png', 'svg', 'pdf'] as const;
export type DesignExportFormat = (typeof DESIGN_EXPORT_FORMATS)[number];

// ---------------------------------------------------------------------------
// Script + argv construction (pure)
// ---------------------------------------------------------------------------

export interface FigCraftScriptStep {
  command: string;
  params: Record<string, unknown>;
}

/**
 * Build the `run` script for a create (pure). The document is authored
 * ENTIRELY by the binary: newFromTemplate (or a blank file.new) then
 * saveAs to the workspace path. No document JSON is ever constructed
 * here — that is the spike's hard rule (§7.4).
 */
export function buildCreateScript(input: {
  template?: string;
  name?: string;
  outputPath: string;
}): FigCraftScriptStep[] {
  if (!input.outputPath) throw new Error('outputPath is required');
  const steps: FigCraftScriptStep[] = [];
  if (input.template) {
    steps.push({
      command: 'file.newFromTemplate',
      params: {
        template: input.template,
        ...(input.name ? { name: input.name } : {}),
      },
    });
  } else {
    steps.push({
      command: 'file.new',
      params: { ...(input.name ? { name: input.name } : {}) },
    });
  }
  steps.push({ command: 'file.saveAs', params: { path: input.outputPath } });
  return steps;
}

/**
 * Build the CLI argv for a headless `run` (pure). The script file and
 * every path it names live inside the per-job workspace, which is
 * passed as BOTH the read and the write root — the binary refuses any
 * touch outside it. --no-system-fonts keeps text layout identical on
 * every machine (the CLI's own determinism flag).
 */
export function buildRunArgs(input: { scriptPath: string; workDir: string }): string[] {
  if (!input.scriptPath) throw new Error('scriptPath is required');
  if (!input.workDir) throw new Error('workDir is required');
  return [
    'run',
    input.scriptPath,
    '--automation-read-root',
    input.workDir,
    '--automation-write-root',
    input.workDir,
    '--no-system-fonts',
  ];
}

export interface BuildExportArgsInput {
  inputPath: string;
  outputPath: string;
  format: string;
  scale?: number;
  page?: string;
  node?: string;
  workDir: string;
}

/**
 * Build the CLI argv for an `export` (pure). Verified forms (spike §2.2
 * + step-4 probing): an <out> path WITH the format's extension (or a
 * --node) writes ONE file; an <out> path without an extension is a
 * directory and receives one file per top-level frame. The processor
 * chooses the form; this builder only renders the argv.
 */
export function buildExportArgs(input: BuildExportArgsInput): string[] {
  if (!input.inputPath) throw new Error('inputPath is required');
  if (!input.outputPath) throw new Error('outputPath is required');
  if (!input.workDir) throw new Error('workDir is required');
  const args = ['export', input.inputPath, '-o', input.outputPath, '--format', input.format];
  if (input.scale != null) args.push('--scale', String(input.scale));
  if (input.page) args.push('--page', input.page);
  if (input.node) args.push('--node', input.node);
  args.push(
    '--no-system-fonts',
    '--automation-read-root',
    input.workDir,
    '--automation-write-root',
    input.workDir,
  );
  return args;
}

// ---------------------------------------------------------------------------
// Run-result parsing + finalize (pure)
// ---------------------------------------------------------------------------

export interface FailedRunStep {
  command: string;
  error: string;
}

/**
 * Find the first failed step in `run` stdout (pure). The CLI prints one
 * JSON result line per step; a failure carries ok:false plus the
 * binary's own error text, and the whole script is rolled back — so a
 * failed step means NO document was produced, whatever the exit code
 * also says. Non-JSON lines are ignored (progress chatter is not a
 * result).
 */
export function parseRunResults(stdoutLines: string[]): FailedRunStep | null {
  for (const line of stdoutLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const rec = parsed as Record<string, unknown>;
    if (rec['ok'] === false) {
      return {
        command: typeof rec['command'] === 'string' ? rec['command'] : 'unknown',
        error: typeof rec['error'] === 'string' ? rec['error'] : 'step failed',
      };
    }
  }
  return null;
}

export type FinalizeDesignOutcome =
  | { status: 'COMPLETED'; outputPath: string }
  | { status: 'FAILED'; error: string };

/** Terminal outcome for a create run, by the honesty rules (pure). */
export function finalizeCreate(input: {
  exitCode: number | null;
  timedOut: boolean;
  outputPath: string;
  outputExists: boolean;
  stderrTail: string;
  failedStep: FailedRunStep | null;
}): FinalizeDesignOutcome {
  if (input.timedOut) {
    return {
      status: 'FAILED',
      error: `FIGCRAFT_TIMEOUT: design creation exceeded its time budget${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (input.failedStep) {
    return {
      status: 'FAILED',
      error: `FIGCRAFT_STEP_FAILED: ${input.failedStep.command}: ${input.failedStep.error}`,
    };
  }
  if (input.exitCode !== 0) {
    return {
      status: 'FAILED',
      error: `FIGCRAFT_EXIT_${input.exitCode ?? 'SIGNAL'}${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (!input.outputExists) {
    return {
      status: 'FAILED',
      error: 'DESIGN_NO_OUTPUT: CLI exited 0 but produced no design document',
    };
  }
  return { status: 'COMPLETED', outputPath: input.outputPath };
}

/** Terminal outcome for an export run, by the honesty rules (pure). */
export function finalizeExport(input: {
  exitCode: number | null;
  timedOut: boolean;
  outputPath: string;
  outputProduced: boolean;
  stderrTail: string;
}): FinalizeDesignOutcome {
  if (input.timedOut) {
    return {
      status: 'FAILED',
      error: `FIGCRAFT_TIMEOUT: design export exceeded its time budget${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (input.exitCode !== 0) {
    return {
      status: 'FAILED',
      error: `FIGCRAFT_EXIT_${input.exitCode ?? 'SIGNAL'}${input.stderrTail ? `: ${input.stderrTail}` : ''}`,
    };
  }
  if (!input.outputProduced) {
    return {
      status: 'FAILED',
      error: 'EXPORT_NO_OUTPUT: CLI exited 0 but produced no export file',
    };
  }
  return { status: 'COMPLETED', outputPath: input.outputPath };
}

// ---------------------------------------------------------------------------
// Runner (the C-2/C-3B seam)
// ---------------------------------------------------------------------------

export interface FigCraftRunResult {
  exitCode: number | null;
  stderrTail: string;
  stdoutTail: string;
  timedOut: boolean;
}

/**
 * Runner interface:
 *   run(argv, { onStdoutLine, onStderrLine }) -> FigCraftRunResult
 * `run` prints its step results on STDOUT (unlike EffectCraft's stderr
 * progress), so both streams are captured and forwarded.
 */
export interface FigCraftRunner {
  run(
    argv: string[],
    options?: {
      onStdoutLine?: (line: string) => void;
      onStderrLine?: (line: string) => void;
    },
  ): Promise<FigCraftRunResult>;
}

const DEFAULT_DESIGN_TIMEOUT_MS = 10 * 60 * 1000;
const TAIL_LINES = 20;

export function designTimeoutFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env['FIGCRAFT_DESIGN_TIMEOUT_MS']);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DESIGN_TIMEOUT_MS;
}

/** Real runner: spawns the pinned companion CLI with an argv array (no
 *  shell), streams both output streams line-wise, and enforces a
 *  timeout (SIGTERM, then SIGKILL after a grace period). */
export class NodeFigCraftRunner implements FigCraftRunner {
  constructor(
    private readonly binPath: string,
    private readonly timeoutMs: number = designTimeoutFromEnv(),
  ) {}

  run(
    argv: string[],
    options: {
      onStdoutLine?: (line: string) => void;
      onStderrLine?: (line: string) => void;
    } = {},
  ): Promise<FigCraftRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
      const stderrTailLines: string[] = [];
      const stdoutTailLines: string[] = [];
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
        tail: string[],
        onLine?: (line: string) => void,
      ) => {
        stream.setEncoding('utf8');
        let buf = '';
        stream.on('data', (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            tail.push(line);
            if (tail.length > TAIL_LINES) tail.shift();
            onLine?.(line);
          }
        });
        stream.on('end', () => {
          if (buf.length > 0) {
            tail.push(buf);
            if (tail.length > TAIL_LINES) tail.shift();
            onLine?.(buf);
          }
        });
      };
      pump(child.stdout, stdoutTailLines, options.onStdoutLine);
      pump(child.stderr, stderrTailLines, options.onStderrLine);

      child.on('error', (err) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        resolve({
          exitCode: code,
          stderrTail: stderrTailLines.join('\n'),
          stdoutTail: stdoutTailLines.join('\n'),
          timedOut,
        });
      });
    });
  }

  /** `figcraft-cli --version` — boot logging and the gated IT. */
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
 * (FIGCRAFT_BIN). Returns null when unset, missing, or not executable:
 * the caller treats null as FIGCRAFT_NOT_CONFIGURED and fails closed.
 * The binary is never vendored into or downloaded by this codebase.
 */
export function resolveFigCraftBin(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const bin = env['FIGCRAFT_BIN'];
  if (!bin) return null;
  try {
    accessSync(bin, fsConstants.X_OK);
    return bin;
  } catch {
    return null;
  }
}

/** Build the production runner, or null when the companion is not configured. */
export function buildFigCraftRunner(env: NodeJS.ProcessEnv = process.env): NodeFigCraftRunner | null {
  const bin = resolveFigCraftBin(env);
  if (!bin) return null;
  return new NodeFigCraftRunner(bin, designTimeoutFromEnv(env));
}

// ---------------------------------------------------------------------------
// Orchestration (validate BEFORE any spawn, then run + finalize)
// ---------------------------------------------------------------------------

export interface CreateWithFigCraftInput {
  /** Per-job scratch dir; the script and the document both live in it. */
  workDir: string;
  outputPath: string;
  template?: string;
  name?: string;
  runner: FigCraftRunner;
  fileExists?: (path: string) => boolean;
}

/**
 * Create one design document headlessly: validate the template against
 * the allowlist BEFORE any spawn, write the run script (the binary's
 * own commands — never document JSON), run it confined to the
 * workspace, and finalize by the honesty rules.
 */
export async function createDesignWithFigCraft(
  input: CreateWithFigCraftInput,
): Promise<FinalizeDesignOutcome> {
  const validation = validateTemplateId(input.template);
  if (!validation.ok) {
    return { status: 'FAILED', error: `INVALID_TEMPLATE: ${validation.errors.join('; ')}` };
  }

  const script = buildCreateScript({
    template: input.template,
    name: input.name,
    outputPath: input.outputPath,
  });
  const scriptPath = join(input.workDir, 'create-script.json');
  writeFileSync(scriptPath, JSON.stringify(script));

  const stdoutLines: string[] = [];
  const { exitCode, stderrTail, timedOut } = await input.runner.run(
    buildRunArgs({ scriptPath, workDir: input.workDir }),
    { onStdoutLine: (line) => stdoutLines.push(line) },
  );

  const fileExists = input.fileExists ?? existsSync;
  return finalizeCreate({
    exitCode,
    timedOut,
    outputPath: input.outputPath,
    outputExists: fileExists(input.outputPath),
    stderrTail,
    failedStep: parseRunResults(stdoutLines),
  });
}

export interface ExportWithFigCraftInput {
  inputPath: string;
  outputPath: string;
  format: string;
  scale?: number;
  page?: string;
  node?: string;
  workDir: string;
  runner: FigCraftRunner;
  /** Whether the export produced output: a file check in single-file
   *  mode, a non-empty-directory check in per-frame mode. The caller
   *  owns the mode, so the caller owns the check. */
  outputProduced: () => boolean;
}

/** Export one design document: build argv, run confined, finalize. */
export async function exportDesignWithFigCraft(
  input: ExportWithFigCraftInput,
): Promise<FinalizeDesignOutcome> {
  const argv = buildExportArgs({
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    format: input.format,
    scale: input.scale,
    page: input.page,
    node: input.node,
    workDir: input.workDir,
  });

  const { exitCode, stderrTail, timedOut } = await input.runner.run(argv);

  return finalizeExport({
    exitCode,
    timedOut,
    outputPath: input.outputPath,
    outputProduced: input.outputProduced(),
    stderrTail,
  });
}
