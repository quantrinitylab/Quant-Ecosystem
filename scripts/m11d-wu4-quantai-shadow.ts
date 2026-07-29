#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MemoryShadowReportRepository,
  PrismaClient,
  type ListMemoryShadowReportsOptions,
  type MemoryShadowReportRow,
} from '../packages/database/src/index';
import type { DivergenceSeverity, ShadowReport } from '../packages/ai/src/core/memory-facade';
import { CORPUS_VERSION } from '../packages/ai/src/eval/corpus';
import {
  WU4_REQUIRED_RECALLS,
  buildQuantaiShadowTrafficPlan,
  evaluateQuantaiShadowEvidence,
  type PersistedShadowEvidence,
} from '../packages/ai/src/eval/quantai-shadow-evidence';

interface VersionFreeze {
  capturedAt: string;
  extractionModel: string;
  embeddingModel: string;
  promptRevision: string;
  policyVersion: string;
  corpusVersion: string;
  commitSha: string;
  workingTreeDirty: boolean;
  lockfileHash: string;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineDir = join(root, 'docs', 'baselines');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  return value as string[];
}

function severity(value: unknown): DivergenceSeverity {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL') {
    return value;
  }
  throw new Error('divergence.severity is invalid');
}

function toShadowReport(row: MemoryShadowReportRow): ShadowReport {
  if (row.mode !== 'shadow') throw new Error(`Unexpected report mode: ${row.mode}`);
  const legacy = object(row.legacy, 'legacy');
  const next = object(row.next, 'next');
  const divergence = object(row.divergence, 'divergence');
  return {
    requestId: row.requestId,
    mode: 'shadow',
    actorUserId: row.actorUserId,
    query: row.query,
    legacy: {
      recalled: stringArray(legacy['recalled'], 'legacy.recalled'),
      latencyMs: numberValue(legacy['latencyMs'], 'legacy.latencyMs'),
    },
    next: {
      recalled: stringArray(next['recalled'], 'next.recalled'),
      latencyMs: numberValue(next['latencyMs'], 'next.latencyMs'),
      ...(typeof next['error'] === 'string' ? { error: next['error'] } : {}),
    },
    divergence: {
      onlyLegacy: stringArray(divergence['onlyLegacy'], 'divergence.onlyLegacy'),
      onlyNew: stringArray(divergence['onlyNew'], 'divergence.onlyNew'),
      agreementRate: numberValue(divergence['agreementRate'], 'divergence.agreementRate'),
      severity: severity(divergence['severity']),
    },
    at: row.observedAt.getTime(),
  };
}

function toEvidence(row: MemoryShadowReportRow): PersistedShadowEvidence {
  const report = toShadowReport(row);
  if (
    row.severity !== report.divergence.severity ||
    row.agreementRate !== report.divergence.agreementRate ||
    row.infrastructureError !== (report.next.error !== undefined)
  ) {
    throw new Error(`Denormalized evidence mismatch for ${row.requestId}`);
  }
  return {
    tenantId: row.tenantId,
    actorUserId: row.actorUserId,
    commitSha: row.commitSha,
    policyVersion: row.policyVersion,
    corpusVersion: row.corpusVersion,
    observedAt: row.observedAt,
    report,
  };
}

async function requestJson(
  url: string,
  token: string,
  init: Omit<RequestInit, 'signal'> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`QuantAI request failed: ${response.status} ${response.statusText}`);
  }
  return object((await response.json()) as unknown, 'QuantAI response');
}

function assertShadowEnvelope(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload['success'] !== true) throw new Error('QuantAI response did not report success');
  const data = object(payload['data'], 'QuantAI response.data');
  if (data['mode'] !== 'shadow') {
    throw new Error(`QuantAI mode is ${String(data['mode'])}, expected shadow`);
  }
  return data;
}

function validateBaseUrl(raw: string): string {
  const url = new URL(raw);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('WU4_MEMORY_BASE_URL must use HTTPS, except for localhost');
  }
  return url.toString().replace(/\/$/, '');
}

async function loadFreeze(
  pathValue: string,
): Promise<{ freeze: VersionFreeze; content: string; path: string }> {
  const freezePath = isAbsolute(pathValue) ? resolve(pathValue) : resolve(root, pathValue);
  const relativePath = relative(baselineDir, freezePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('WU4_FREEZE_FILE must be inside docs/baselines');
  }
  const content = await readFile(freezePath, 'utf8');
  const value = object(JSON.parse(content) as unknown, 'version freeze');
  if (typeof value['workingTreeDirty'] !== 'boolean') {
    throw new Error('freeze.workingTreeDirty must be a boolean');
  }
  const freeze: VersionFreeze = {
    capturedAt: stringValue(value['capturedAt'], 'freeze.capturedAt'),
    extractionModel: stringValue(value['extractionModel'], 'freeze.extractionModel'),
    embeddingModel: stringValue(value['embeddingModel'], 'freeze.embeddingModel'),
    promptRevision: stringValue(value['promptRevision'], 'freeze.promptRevision'),
    policyVersion: stringValue(value['policyVersion'], 'freeze.policyVersion'),
    corpusVersion: stringValue(value['corpusVersion'], 'freeze.corpusVersion'),
    commitSha: stringValue(value['commitSha'], 'freeze.commitSha'),
    workingTreeDirty: value['workingTreeDirty'],
    lockfileHash: stringValue(value['lockfileHash'], 'freeze.lockfileHash'),
  };
  if (freeze.workingTreeDirty) throw new Error('Version freeze records a dirty working tree');
  return { freeze, content, path: freezePath };
}

function scenarioCounts(
  plan: ReturnType<typeof buildQuantaiShadowTrafficPlan>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const recall of plan.recalls) {
    counts[recall.scenarioId] = (counts[recall.scenarioId] ?? 0) + 1;
  }
  return counts;
}

async function waitForReports(
  repository: MemoryShadowReportRepository,
  actorUserId: string,
  filters: Omit<ListMemoryShadowReportsOptions, 'limit'>,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const count = await repository.countForTenant(actorUserId, filters);
    if (count === WU4_REQUIRED_RECALLS) return;
    if (count > WU4_REQUIRED_RECALLS) throw new Error(`WU4 report overflow: ${count}`);
    await sleep(500);
  }
  const count = await repository.countForTenant(actorUserId, filters);
  throw new Error(`Timed out waiting for ${WU4_REQUIRED_RECALLS} reports; found ${count}`);
}

function printPlan(): void {
  const plan = buildQuantaiShadowTrafficPlan();
  console.log(
    JSON.stringify(
      {
        manifestVersion: plan.manifestVersion,
        corpusVersion: plan.corpusVersion,
        observations: plan.observations.length,
        recalls: plan.recalls.length,
        scenarios: [...new Set(plan.recalls.map((recall) => recall.scenarioId))],
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  if (process.argv.includes('--plan')) {
    printPlan();
    return;
  }
  if (process.env['WU4_CONFIRM_500'] !== 'YES') {
    throw new Error('Set WU4_CONFIRM_500=YES to acknowledge 500 live shadow recalls');
  }
  const databaseUrl = required('DATABASE_URL');
  const memoryBaseUrl = validateBaseUrl(required('WU4_MEMORY_BASE_URL'));
  const token = required('WU4_AUTH_TOKEN');
  const actorUserId = required('WU4_ACTOR_ID');
  const commitSha = required('QUANT_COMMIT_SHA');
  const policyVersion = required('MEMORY_POLICY_VERSION');
  const configuredCorpus = required('MEMORY_CORPUS_VERSION');
  if (!/^wu4[-_][a-z0-9_-]+$/i.test(actorUserId)) {
    throw new Error('WU4_ACTOR_ID must identify a dedicated synthetic wu4-* actor');
  }
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) {
    throw new Error('QUANT_COMMIT_SHA must be a full SHA');
  }
  if (configuredCorpus !== CORPUS_VERSION) {
    throw new Error(`MEMORY_CORPUS_VERSION must be ${CORPUS_VERSION}`);
  }

  const freezePathValue = required('WU4_FREEZE_FILE');
  const { freeze, content: freezeContent, path: freezePath } = await loadFreeze(freezePathValue);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const statusLines = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const allowedFreezeStatus = `?? ${relative(root, freezePath).replace(/\\/g, '/')}`;
  const unexpectedChanges = statusLines.filter((line) => line !== allowedFreezeStatus);
  if (unexpectedChanges.length > 0) {
    throw new Error('WU4 refuses changes other than the selected untracked version freeze');
  }
  if (head !== commitSha) throw new Error('QUANT_COMMIT_SHA does not match git HEAD');

  if (
    freeze.commitSha !== commitSha ||
    freeze.policyVersion !== policyVersion ||
    freeze.corpusVersion !== configuredCorpus
  ) {
    throw new Error('Version freeze does not match runtime commit/policy/corpus metadata');
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const repository = new MemoryShadowReportRepository(prisma);
  try {
    await prisma.$connect();
    const existingMemories = await prisma.memoryRecord.count({ where: { ownerId: actorUserId } });
    const existingReports = await repository.countForTenant(actorUserId);
    if (existingMemories !== 0 || existingReports !== 0) {
      throw new Error('WU4 synthetic actor must have no pre-existing memories or reports');
    }

    const status = assertShadowEnvelope(await requestJson(`${memoryBaseUrl}/facade/status`, token));
    if (status['persistedCount'] !== 0) throw new Error('WU4 actor already has reports');

    const plan = buildQuantaiShadowTrafficPlan();
    const runStartedAt = new Date();
    for (const observation of plan.observations) {
      assertShadowEnvelope(
        await requestJson(`${memoryBaseUrl}/observe`, token, {
          method: 'POST',
          body: JSON.stringify({
            session: observation.session,
            role: observation.role,
            content: observation.content,
          }),
        }),
      );
    }
    for (const recall of plan.recalls) {
      const url = new URL(`${memoryBaseUrl}/recall`);
      url.searchParams.set('query', recall.query);
      assertShadowEnvelope(await requestJson(url.toString(), token));
    }
    const runEndedAt = new Date();
    const filters = {
      actorUserId,
      commitSha,
      policyVersion,
      corpusVersion: configuredCorpus,
      observedAfter: runStartedAt,
      observedBefore: runEndedAt,
    };
    await waitForReports(repository, actorUserId, filters);
    const rows = await repository.listForTenant(actorUserId, {
      ...filters,
      limit: WU4_REQUIRED_RECALLS,
    });
    const records = rows
      .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime())
      .map(toEvidence);
    const summary = evaluateQuantaiShadowEvidence(records, {
      actorUserId,
      commitSha,
      policyVersion,
      corpusVersion: configuredCorpus,
    });

    const actorScopeHash = sha256(actorUserId).slice(0, 16);
    const replayContent =
      records
        .map((record) =>
          JSON.stringify({
            artifactVersion: 'm11d-wu4-replay-record-v1',
            actorScopeHash,
            commitSha: record.commitSha,
            policyVersion: record.policyVersion,
            corpusVersion: record.corpusVersion,
            observedAt: record.observedAt.toISOString(),
            report: { ...record.report, actorUserId: `redacted:${actorScopeHash}` },
          }),
        )
        .join('\n') + '\n';

    const capturedAt = new Date().toISOString();
    const suffix = capturedAt.replace(/[:.]/g, '-');
    const replayName = `m11d-wu4-quantai-shadow-${CORPUS_VERSION}-${suffix}.replay.v1.jsonl`;
    const reportName = `m11d-wu4-quantai-shadow-${CORPUS_VERSION}-${suffix}.report.v1.json`;
    const replayPath = join(baselineDir, replayName);
    const reportPath = join(baselineDir, reportName);
    const report = {
      artifactVersion: 'm11d-wu4-shadow-report-v1',
      capturedAt,
      decision: summary.gates.decision,
      authority: 'evidence-only; WU6 owns migration decision',
      run: {
        startedAt: runStartedAt.toISOString(),
        endedAt: runEndedAt.toISOString(),
        actorScopeHash,
        commitSha,
        policyVersion,
        corpusVersion: configuredCorpus,
      },
      freeze: {
        file: basename(freezePath),
        sha256: sha256(freezeContent),
        ...freeze,
      },
      traffic: {
        manifestVersion: plan.manifestVersion,
        manifestSha256: sha256(JSON.stringify(plan)),
        observations: plan.observations.length,
        recallsRequested: plan.recalls.length,
        recallsPersisted: records.length,
        scenarioCounts: scenarioCounts(plan),
      },
      replay: { file: replayName, sha256: sha256(replayContent), records: records.length },
      evaluation: summary,
      releaseBoundary: {
        legacyAuthoritative: true,
        newAuthorityEnabled: false,
        pendingAgreementMeasured: false,
      },
    };

    await writeFile(replayPath, replayContent, { encoding: 'utf8', flag: 'wx' });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.log(`WU4 evidence: ${summary.gates.decision}`);
    console.log(`report: ${relative(root, reportPath)}`);
    console.log(`replay: ${relative(root, replayPath)}`);
  } finally {
    await prisma.$disconnect();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(
      `WU4 shadow run failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
