#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPROVED_PRODUCTION_MEMORY_DEPLOY_MODES = ['legacy'] as const;
export type ApprovedProductionMemoryDeployMode =
  (typeof APPROVED_PRODUCTION_MEMORY_DEPLOY_MODES)[number];

export class MemoryReleaseGateError extends Error {
  readonly code = 'MEMORY_RELEASE_GATE_BLOCKED';

  constructor(message: string) {
    super(message);
    this.name = 'MemoryReleaseGateError';
  }
}

/** Production stays legacy-authoritative while WU4/WU5 evidence is incomplete. */
export function validateMemoryDeployMode(
  value: string | undefined,
): ApprovedProductionMemoryDeployMode {
  if (value === undefined || value.length === 0 || value.trim().length === 0) {
    throw new MemoryReleaseGateError('QUANTAI_MEMORY_MODE must be explicit at deployment');
  }
  if (value === 'new') {
    throw new MemoryReleaseGateError(
      'QUANTAI_MEMORY_MODE=new is blocked while ADR-011 migration decision is HOLD',
    );
  }
  if (value === 'legacy') return value;
  throw new MemoryReleaseGateError(
    `Production memory mode ${value} is blocked until ordered M11d evidence is approved`,
  );
}

/** Parse one literal env entry and reject indirection, interpolation, and duplicates. */
export function extractManifestMemoryMode(manifest: string): string {
  const lines = manifest.split(/\r?\n/);
  const indexes = lines
    .map((line, index) => (line.trim() === '- name: QUANTAI_MEMORY_MODE' ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new MemoryReleaseGateError(
      `Expected exactly one QUANTAI_MEMORY_MODE entry; found ${indexes.length}`,
    );
  }

  const start = indexes[0]!;
  const next = lines
    .slice(start + 1)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));
  if (!next || next.startsWith('valueFrom:') || next.includes('${') || next.includes('&')) {
    throw new MemoryReleaseGateError('QUANTAI_MEMORY_MODE must use one literal value');
  }
  const match = next.match(/^value:\s*(['"]?)([a-z_]+)\1$/);
  if (!match) throw new MemoryReleaseGateError('QUANTAI_MEMORY_MODE value is not canonical');
  return match[2] ?? '';
}

export function validateMemoryDeploymentManifest(
  manifest: string,
): ApprovedProductionMemoryDeployMode {
  return validateMemoryDeployMode(extractManifestMemoryMode(manifest));
}

/** Shadow overlay is canary-only and must never silently choose a mode. */
export function validateShadowComposeOverlay(overlay: string): void {
  const assignments = overlay
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('QUANTAI_MEMORY_MODE:'));
  if (assignments.length !== 1) {
    throw new MemoryReleaseGateError(
      `Expected exactly one shadow overlay mode assignment; found ${assignments.length}`,
    );
  }
  if (!/^QUANTAI_MEMORY_MODE:\s*\$\{QUANTAI_MEMORY_MODE:\?[^}]+\}$/.test(assignments[0]!)) {
    throw new MemoryReleaseGateError(
      'Shadow overlay must require an explicit QUANTAI_MEMORY_MODE without a default',
    );
  }
}

function repositoryPath(root: string, configuredPath: string): string {
  const path = isAbsolute(configuredPath) ? resolve(configuredPath) : resolve(root, configuredPath);
  const repositoryRelative = relative(root, path).replace(/\\/g, '/');
  if (repositoryRelative.startsWith('../') || isAbsolute(repositoryRelative)) {
    throw new MemoryReleaseGateError('Release-gate inputs must be inside the repository');
  }
  return path;
}

function argument(name: string, fallback: string): string {
  return (
    process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
  );
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifestPath = repositoryPath(root, argument('manifest', 'infra/k8s/quantai-backend.yaml'));
  const overlayPath = repositoryPath(root, argument('overlay', 'docker-compose.shadow.yml'));
  const [manifest, overlay] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(overlayPath, 'utf8'),
  ]);
  const mode = validateMemoryDeploymentManifest(manifest);
  validateShadowComposeOverlay(overlay);
  console.log(`Memory release gate: PASS (production=${mode}, shadow=explicit, new=blocked)`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(
      `Memory release gate: FAIL — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
