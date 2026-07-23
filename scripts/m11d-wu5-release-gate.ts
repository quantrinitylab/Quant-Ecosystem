#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPROVED_MEMORY_DEPLOY_MODES = ['legacy', 'dual_write', 'shadow'] as const;
export type ApprovedMemoryDeployMode = (typeof APPROVED_MEMORY_DEPLOY_MODES)[number];

export class MemoryReleaseGateError extends Error {
  readonly code = 'MEMORY_RELEASE_GATE_BLOCKED';

  constructor(message: string) {
    super(message);
    this.name = 'MemoryReleaseGateError';
  }
}

/** Deployment policy is stricter than runtime parsing: value must be explicit and canonical. */
export function validateMemoryDeployMode(value: string | undefined): ApprovedMemoryDeployMode {
  if (value === undefined || value.length === 0 || value.trim().length === 0) {
    throw new MemoryReleaseGateError('QUANTAI_MEMORY_MODE must be explicit at deployment');
  }
  if (value === 'new') {
    throw new MemoryReleaseGateError(
      'QUANTAI_MEMORY_MODE=new is blocked while ADR-011 migration decision is HOLD',
    );
  }
  if ((APPROVED_MEMORY_DEPLOY_MODES as readonly string[]).includes(value)) {
    return value as ApprovedMemoryDeployMode;
  }
  throw new MemoryReleaseGateError(`Unsupported deployment memory mode: ${value}`);
}

/** Extract one explicit container env entry from the checked-in QuantAI manifest. */
export function extractManifestMemoryMode(manifest: string): string {
  const pattern = /-\s+name:\s*QUANTAI_MEMORY_MODE\s*\r?\n\s*value:\s*['"]?([^'"\s#]+)['"]?/g;
  const matches = [...manifest.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new MemoryReleaseGateError(
      `Expected exactly one QUANTAI_MEMORY_MODE entry; found ${matches.length}`,
    );
  }
  return matches[0]?.[1] ?? '';
}

export function validateMemoryDeploymentManifest(manifest: string): ApprovedMemoryDeployMode {
  return validateMemoryDeployMode(extractManifestMemoryMode(manifest));
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const argument = process.argv.find((value) => value.startsWith('--manifest='));
  const configuredPath = argument?.slice('--manifest='.length) ?? 'infra/k8s/quantai-backend.yaml';
  const manifestPath = isAbsolute(configuredPath)
    ? resolve(configuredPath)
    : resolve(root, configuredPath);
  const relativePath = relative(root, manifestPath).replace(/\\/g, '/');
  if (relativePath.startsWith('../') || isAbsolute(relativePath)) {
    throw new MemoryReleaseGateError('Manifest must be inside the repository');
  }
  const manifest = await readFile(manifestPath, 'utf8');
  const mode = validateMemoryDeploymentManifest(manifest);
  console.log(`Memory release gate: PASS (${relativePath}, mode=${mode}, new=blocked)`);
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
