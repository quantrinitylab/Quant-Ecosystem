import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

export const MAX_LEASE_MS = 30 * 60 * 1000;
const ROLES = ['compass', 'forge', 'vector', 'prism', 'sentinel'];
const STATES = ['ready', 'active', 'paused', 'blocked', 'review'];
const BLOCKERS = [
  'quota',
  'budget',
  'access',
  'test_environment',
  'owner_decision',
];
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
const SHA = /^[a-f0-9]{40}$/;
const REPO = 'quantrinitylab/Quant-Ecosystem';
export class CoordinationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CoordinationError';
    this.code = code;
  }
}
function need(ok, code) {
  if (!ok) throw new CoordinationError(code);
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value, allowed) {
  need(object(value), 'INVALID_OBJECT');
  need(
    Object.keys(value).every((key) => allowed.includes(key)),
    'UNKNOWN_FIELD',
  );
}
function identifier(value) {
  return typeof value === 'string' && ID.test(value);
}
function text(value) {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 4000
  );
}
function strings(value) {
  return Array.isArray(value) && value.length <= 100 && value.every(text);
}
function time(value) {
  need(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value),
    'INVALID_TIME',
  );
  const valueMs = Date.parse(value);
  need(
    Number.isFinite(valueMs) && new Date(valueMs).toISOString() === value,
    'INVALID_TIME',
  );
  return valueMs;
}
function safePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length < 240 &&
    !value.startsWith('/') &&
    !/[\\:\0]/.test(value) &&
    value
      .replace(/\/$/, '')
      .split('/')
      .every((part) => part && part !== '.' && part !== '..')
  );
}
function branch(value) {
  return (
    typeof value === 'string' &&
    /^ai\/[A-Za-z0-9][A-Za-z0-9_./-]{1,150}$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//') &&
    !value.endsWith('/') &&
    !value.endsWith('.') &&
    value
      .split('/')
      .every((part) => !part.startsWith('.') && !part.endsWith('.lock'))
  );
}
function projectEvidence(value) {
  try {
    const url = new URL(value);
    return (
      !/\s/.test(value) &&
      url.protocol === 'https:' &&
      url.origin === 'https:' + '//github.com' &&
      !url.username &&
      !url.password &&
      !url.search &&
      url.href.startsWith('https:' + '//github.com/' + REPO + '/')
    );
  } catch {
    return false;
  }
}
export function validateCheckpoint(cp) {
  keys(cp, [
    'sourceCommit',
    'branch',
    'checkedAt',
    'observed',
    'reported',
    'hypotheses',
    'notRun',
    'evidence',
    'next',
  ]);
  need(SHA.test(cp.sourceCommit), 'INVALID_COMMIT');
  need(branch(cp.branch), 'INVALID_WORK_BRANCH');
  time(cp.checkedAt);
  for (const key of [
    'observed',
    'reported',
    'hypotheses',
    'notRun',
    'evidence',
  ])
    need(strings(cp[key]), 'INVALID_CHECKPOINT_LIST');
  need(text(cp.next), 'MISSING_NEXT_ACTION');
  need(
    cp.evidence.length > 0 && cp.evidence.every(projectEvidence),
    'NON_PROJECT_EVIDENCE',
  );
  return cp;
}
export function validateTask(s) {
  keys(s, [
    'schemaVersion',
    'authority',
    'taskId',
    'repository',
    'role',
    'goal',
    'permission',
    'writePaths',
    'revision',
    'fence',
    'status',
    'blockedReason',
    'lease',
    'checkpoint',
  ]);
  need(
    s.schemaVersion === 1 && s.authority === 'working-context',
    'INVALID_SCHEMA',
  );
  need(
    typeof s.taskId === 'string' && /^[A-Z][A-Z0-9-]{2,63}$/.test(s.taskId),
    'INVALID_TASK_ID',
  );
  need(
    s.repository === REPO && ROLES.includes(s.role) && text(s.goal),
    'INVALID_TASK',
  );
  need(
    ['read-only', 'draft-code'].includes(s.permission),
    'INVALID_PERMISSION',
  );
  need(
    Array.isArray(s.writePaths) &&
      s.writePaths.length <= 30 &&
      s.writePaths.every(safePath),
    'INVALID_WRITE_PATHS',
  );
  need(
    s.permission !== 'read-only' || s.writePaths.length === 0,
    'READ_ONLY_PATHS',
  );
  need(
    s.permission !== 'draft-code' || s.writePaths.length > 0,
    'MISSING_WRITE_SCOPE',
  );
  need(
    Number.isSafeInteger(s.revision) &&
      s.revision >= 0 &&
      Number.isSafeInteger(s.fence) &&
      s.fence >= 0,
    'INVALID_GENERATION',
  );
  need(STATES.includes(s.status), 'INVALID_STATUS');
  need(
    s.status === 'blocked'
      ? BLOCKERS.includes(s.blockedReason)
      : s.blockedReason === null,
    'INVALID_BLOCKER',
  );
  if (s.status === 'active') {
    keys(s.lease, ['holder', 'id', 'issuedAt', 'expiresAt']);
    need(identifier(s.lease.holder) && identifier(s.lease.id), 'INVALID_CLAIM');
    const length = time(s.lease.expiresAt) - time(s.lease.issuedAt);
    need(length > 0 && length <= MAX_LEASE_MS, 'INVALID_TTL');
  } else need(s.lease === null, 'UNEXPECTED_CLAIM');
  validateCheckpoint(s.checkpoint);
  return s;
}
export function claimToken(s) {
  validateTask(s);
  need(s.status === 'active', 'NOT_ACTIVE');
  return { holder: s.lease.holder, id: s.lease.id, fence: s.fence };
}
function owned(s, token, now) {
  need(s.status === 'active', 'NOT_ACTIVE');
  need(
    object(token) &&
      token.holder === s.lease.holder &&
      token.id === s.lease.id &&
      token.fence === s.fence,
    'STALE_CLAIM',
  );
  need(
    now >= time(s.lease.issuedAt) && now < time(s.lease.expiresAt),
    'EXPIRED_CLAIM',
  );
}
function newLease(s, e, now) {
  need(identifier(e.holder) && identifier(e.id), 'INVALID_CLAIM');
  need(
    Number.isSafeInteger(e.ttlMs) && e.ttlMs > 0 && e.ttlMs <= MAX_LEASE_MS,
    'INVALID_TTL',
  );
  need(e.observedHead === s.checkpoint.sourceCommit, 'UNRECONCILED_HEAD');
  need(time(s.checkpoint.checkedAt) <= now, 'FUTURE_CHECKPOINT');
  s.status = 'active';
  s.blockedReason = null;
  s.fence += 1;
  s.lease = {
    holder: e.holder,
    id: e.id,
    issuedAt: e.now,
    expiresAt: new Date(now + e.ttlMs).toISOString(),
  };
}
function replaceCheckpoint(s, e) {
  validateCheckpoint(e.checkpoint);
  need(e.observedHead === e.checkpoint.sourceCommit, 'UNRECONCILED_HEAD');
  need(e.checkpoint.branch === s.checkpoint.branch, 'WORK_BRANCH_CHANGED');
  need(time(e.checkpoint.checkedAt) <= time(e.now), 'FUTURE_CHECKPOINT');
  need(
    time(e.checkpoint.checkedAt) >= time(s.checkpoint.checkedAt),
    'OLDER_CHECKPOINT',
  );
  s.checkpoint = structuredClone(e.checkpoint);
}
function checkpointMeaning(cp) {
  return JSON.stringify(
    Object.keys(cp)
      .filter((key) => key !== 'checkedAt')
      .sort()
      .map((key) => [key, cp[key]]),
  );
}
export function transition(state, event) {
  validateTask(state);
  need(object(event), 'INVALID_EVENT');
  const now = time(event.now);
  const s = structuredClone(state);
  if (s.status === 'blocked')
    throw new CoordinationError(
      ['quota', 'budget'].includes(s.blockedReason)
        ? 'LIMIT_BLOCK_REQUIRES_OWNER'
        : 'BLOCK_REQUIRES_OWNER',
    );
  if (event.type === 'claim') {
    need(['ready', 'paused'].includes(s.status), 'CLAIM_UNAVAILABLE');
    newLease(s, event, now);
  } else if (event.type === 'takeover') {
    need(s.status === 'active' && now >= time(s.lease.expiresAt), 'LIVE_CLAIM');
    need(
      event.holder !== s.lease.holder && event.id !== s.lease.id,
      'NEW_WORKER_REQUIRED',
    );
    replaceCheckpoint(s, event);
    newLease(s, event, now);
  } else {
    owned(s, event.token, now);
    need(
      ['checkpoint', 'yield', 'block', 'review'].includes(event.type),
      'UNKNOWN_EVENT',
    );
    const before = checkpointMeaning(s.checkpoint);
    replaceCheckpoint(s, event);
    if (event.type === 'checkpoint') {
      need(before !== checkpointMeaning(s.checkpoint), 'NO_MEANINGFUL_CHANGE');
      if (event.ttlMs !== undefined) {
        need(
          Number.isSafeInteger(event.ttlMs) &&
            event.ttlMs > 0 &&
            event.ttlMs <= MAX_LEASE_MS,
          'INVALID_TTL',
        );
        s.lease.issuedAt = event.now;
        s.lease.expiresAt = new Date(now + event.ttlMs).toISOString();
      }
    } else {
      if (event.type === 'yield')
        need(
          [
            'session_end',
            'context_reset',
            'runtime_failure',
            'owner_handoff',
          ].includes(event.reason),
          'INVALID_YIELD_REASON',
        );
      if (event.type === 'block')
        need(BLOCKERS.includes(event.reason), 'INVALID_BLOCKER');
      s.status =
        event.type === 'yield'
          ? 'paused'
          : event.type === 'review'
            ? 'review'
            : 'blocked';
      s.blockedReason = event.type === 'block' ? event.reason : null;
      s.lease = null;
      s.fence += 1;
    }
  }
  s.revision += 1;
  return validateTask(s);
}
export function assertWriteAllowed(s, token, path, now) {
  validateTask(s);
  owned(s, token, time(now));
  need(s.permission === 'draft-code', 'READ_ONLY_TASK');
  need(
    safePath(path) &&
      s.writePaths.some((prefix) =>
        prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
      ),
    'OUT_OF_SCOPE',
  );
  return true;
}
export function prepareUpdate(state, event, expectedBlobSha, controlBranch) {
  need(
    typeof expectedBlobSha === 'string' && SHA.test(expectedBlobSha),
    'CURRENT_BLOB_REQUIRED',
  );
  need(branch(controlBranch), 'EXPLICIT_CONTROL_BRANCH_REQUIRED');
  const next = transition(state, event);
  return {
    repository: REPO,
    branch: controlBranch,
    path: `.agents/team/tasks/${state.taskId}.json`,
    expectedBlobSha,
    content: JSON.stringify(next, null, 2) + '\n',
    requiresAuthorizedAdapter: true,
    requiresRemoteReadback: true,
  };
}
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (
  entry &&
  existsSync(entry) &&
  realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    const [command, stateFile, eventFile, blobSha, controlBranch] =
      process.argv.slice(2);
    need(
      ['validate', 'plan'].includes(command) && stateFile,
      'USAGE_VALIDATE_OR_PLAN',
    );
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    if (command === 'validate') {
      validateTask(state);
      console.log(`Valid working-context task: ${state.taskId}`);
    } else {
      need(eventFile, 'EVENT_REQUIRED');
      const event = JSON.parse(readFileSync(eventFile, 'utf8'));
      console.log(
        JSON.stringify(
          prepareUpdate(state, event, blobSha, controlBranch),
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'VALIDATION_FAILED');
    process.exitCode = 1;
  }
}
