import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  MAX_LEASE_MS,
  validateTask,
  transition,
  claimToken,
  assertWriteAllowed,
  prepareUpdate,
} from './coordination.mjs';
const T0 = '2026-09-10T06:00:00.000Z';
const T1 = '2026-09-10T06:01:00.000Z';
const T2 = '2026-09-10T06:02:00.000Z';
const EXPIRED = '2026-09-10T06:31:00.000Z';
const CONTROL = 'ai/agent-team-memory-20260910';
const blob = 'a'.repeat(40);
function fresh() {
  return JSON.parse(
    readFileSync(
      new URL('./examples/ready-task.json', import.meta.url),
      'utf8',
    ),
  );
}
function claim(s = fresh()) {
  return transition(s, {
    type: 'claim',
    now: T0,
    holder: 'vector-run-1',
    id: 'claim-1',
    ttlMs: MAX_LEASE_MS,
    observedHead: s.checkpoint.sourceCommit,
  });
}
function cp(s, next = 'Inspect the actual result and update the handoff.') {
  return { ...structuredClone(s.checkpoint), checkedAt: T1, next };
}
function event(s, type, extra = {}) {
  return {
    type,
    now: T1,
    token: claimToken(s),
    checkpoint: cp(s),
    observedHead: s.checkpoint.sourceCommit,
    ...extra,
  };
}
function rejects(code, fn) {
  assert.throws(fn, (error) => error.code === code);
}

test('real blocked seed validates and names no worker', () => {
  const s = JSON.parse(
    readFileSync(new URL('./tasks/QM-CI-238.json', import.meta.url), 'utf8'),
  );
  validateTask(s);
  assert.equal(s.lease, null);
  assert.equal(s.status, 'blocked');
});
test('ready claim increments revision/fence without mutating input', () => {
  const s = fresh(),
    original = structuredClone(s),
    active = claim(s);
  assert.deepEqual(s, original);
  assert.equal(active.revision, 1);
  assert.equal(active.fence, 1);
});
test('second worker cannot claim an active task', () =>
  rejects('CLAIM_UNAVAILABLE', () => claim(claim())));
test('meaningful checkpoint preserves claim fence and extends bounded lease', () => {
  const s = claim(),
    next = transition(s, event(s, 'checkpoint', { ttlMs: MAX_LEASE_MS }));
  assert.equal(next.fence, s.fence);
  assert.equal(next.revision, 2);
  assert.equal(next.lease.issuedAt, T1);
});
test('timestamp-only heartbeat is rejected', () => {
  const s = claim();
  rejects('NO_MEANINGFUL_CHANGE', () =>
    transition(
      s,
      event(s, 'checkpoint', {
        checkpoint: { ...s.checkpoint, checkedAt: T1 },
      }),
    ),
  );
});
test('wrong holder/claim/generation cannot checkpoint', () => {
  const s = claim();
  for (const token of [
    { ...claimToken(s), holder: 'another-worker' },
    { ...claimToken(s), id: 'another-claim' },
    { ...claimToken(s), fence: 0 },
  ]) {
    rejects('STALE_CLAIM', () =>
      transition(s, event(s, 'checkpoint', { token })),
    );
  }
});
test('expired worker cannot write', () => {
  const s = claim();
  rejects('EXPIRED_CLAIM', () =>
    assertWriteAllowed(
      s,
      claimToken(s),
      'apps/quantmail/src/components/X.tsx',
      EXPIRED,
    ),
  );
});
test('graceful handoff invalidates old claim and permits a new authorized generation', () => {
  const s = claim(),
    token = claimToken(s),
    paused = transition(s, event(s, 'yield', { reason: 'session_end' }));
  const next = transition(paused, {
    type: 'claim',
    now: T2,
    holder: 'vector-run-2',
    id: 'claim-2',
    ttlMs: 1000,
    observedHead: paused.checkpoint.sourceCommit,
  });
  assert.ok(next.fence > s.fence);
  rejects('STALE_CLAIM', () =>
    assertWriteAllowed(next, token, 'apps/quantmail/src/components/X.tsx', T2),
  );
});
test('live lease cannot be taken over', () => {
  const s = claim();
  rejects('LIVE_CLAIM', () =>
    transition(
      s,
      event(s, 'takeover', {
        holder: 'vector-run-2',
        id: 'claim-2',
        ttlMs: 1000,
      }),
    ),
  );
});
test('expired takeover requires a reconciled checkpoint and new worker', () => {
  const s = claim();
  const next = transition(s, {
    type: 'takeover',
    now: EXPIRED,
    holder: 'vector-run-2',
    id: 'claim-2',
    ttlMs: 1000,
    checkpoint: cp(s),
    observedHead: s.checkpoint.sourceCommit,
  });
  assert.equal(next.lease.holder, 'vector-run-2');
  assert.ok(next.fence > s.fence);
});
test('takeover does not accept a different observed head from its checkpoint', () => {
  const s = claim();
  rejects('UNRECONCILED_HEAD', () =>
    transition(s, {
      type: 'takeover',
      now: EXPIRED,
      holder: 'vector-run-2',
      id: 'claim-2',
      ttlMs: 1000,
      checkpoint: cp(s),
      observedHead: 'b'.repeat(40),
    }),
  );
});
test('claim also requires a current reconciled source head', () =>
  rejects('UNRECONCILED_HEAD', () =>
    transition(fresh(), {
      type: 'claim',
      now: T0,
      holder: 'vector-run-1',
      id: 'claim-1',
      ttlMs: 1000,
      observedHead: 'b'.repeat(40),
    }),
  ));
for (const reason of ['quota', 'budget'])
  test(`${reason} block cannot become a replacement claim`, () => {
    const s = claim(),
      blocked = transition(s, event(s, 'block', { reason }));
    assert.equal(blocked.lease, null);
    rejects('LIMIT_BLOCK_REQUIRES_OWNER', () =>
      transition(blocked, {
        type: 'claim',
        now: T2,
        holder: 'new-account-label',
        id: 'claim-2',
        ttlMs: 1000,
        observedHead: blocked.checkpoint.sourceCommit,
      }),
    );
  });
test('access block cannot be silently resumed', () => {
  const s = claim(),
    b = transition(s, event(s, 'block', { reason: 'access' }));
  rejects('BLOCK_REQUIRES_OWNER', () =>
    transition(b, { type: 'claim', now: T2 }),
  );
});
test('quota cannot be disguised as a graceful-yield reason', () => {
  const s = claim();
  rejects('INVALID_YIELD_REASON', () =>
    transition(s, event(s, 'yield', { reason: 'quota' })),
  );
});
test('worker completion means review, not accepted or deployed', () => {
  const s = claim(),
    reviewed = transition(s, event(s, 'review'));
  assert.equal(reviewed.status, 'review');
  assert.equal(reviewed.lease, null);
});
test('read-only task cannot authorize a code write', () => {
  const s = fresh();
  s.permission = 'read-only';
  s.writePaths = [];
  const a = claim(s);
  rejects('READ_ONLY_TASK', () =>
    assertWriteAllowed(
      a,
      claimToken(a),
      'apps/quantmail/src/components/X.tsx',
      T1,
    ),
  );
});
test('path scope allows only the explicitly assigned boundary', () => {
  const s = claim(),
    token = claimToken(s);
  assertWriteAllowed(s, token, 'apps/quantmail/src/components/X.tsx', T1);
  for (const path of [
    'apps/quantmail/backend/app.ts',
    'apps/quantmail/src/components-else/X.tsx',
    'apps/quantmail/src/components/../../secret',
    '/tmp/file',
  ])
    rejects('OUT_OF_SCOPE', () => assertWriteAllowed(s, token, path, T1));
});
test('lease TTL is finite and bounded', () =>
  rejects('INVALID_TTL', () =>
    transition(fresh(), {
      type: 'claim',
      now: T0,
      holder: 'vector-run-1',
      id: 'claim-1',
      ttlMs: MAX_LEASE_MS + 1,
      observedHead: fresh().checkpoint.sourceCommit,
    }),
  ));
test('unknown fields and non-project evidence are rejected, not treated as instructions', () => {
  const a = fresh();
  a.accountToken = 'DO_NOT_STORE';
  rejects('UNKNOWN_FIELD', () => validateTask(a));
  const b = fresh();
  b.checkpoint.evidence = ['https://example.invalid/private'];
  rejects('NON_PROJECT_EVIDENCE', () => validateTask(b));
});
test('invalid dates and changed feature branches are rejected', () => {
  const a = fresh();
  a.checkpoint.checkedAt = '2026-02-31T00:00:00.000Z';
  rejects('INVALID_TIME', () => validateTask(a));
  const s = claim();
  rejects('WORK_BRANCH_CHANGED', () =>
    transition(
      s,
      event(s, 'checkpoint', {
        checkpoint: { ...cp(s), branch: 'ai/other-work' },
      }),
    ),
  );
});
test('update plan requires explicit task blob SHA and non-main control branch', () => {
  const s = fresh(),
    e = {
      type: 'claim',
      now: T0,
      holder: 'vector-run-1',
      id: 'claim-1',
      ttlMs: 1000,
      observedHead: s.checkpoint.sourceCommit,
    };
  rejects('CURRENT_BLOB_REQUIRED', () => prepareUpdate(s, e, '', CONTROL));
  rejects('EXPLICIT_CONTROL_BRANCH_REQUIRED', () =>
    prepareUpdate(s, e, blob, 'main'),
  );
  const plan = prepareUpdate(s, e, blob, CONTROL);
  assert.equal(plan.expectedBlobSha, blob);
  assert.equal(plan.requiresRemoteReadback, true);
});
test('simulated GitHub-style CAS rejects a competing plan; not a live integration test', () => {
  const s = fresh();
  let currentSha = blob;
  let committed;
  const update = (holder) =>
    prepareUpdate(
      s,
      {
        type: 'claim',
        now: T0,
        holder,
        id: holder + '-claim',
        ttlMs: 1000,
        observedHead: s.checkpoint.sourceCommit,
      },
      blob,
      CONTROL,
    );
  const first = update('worker-one'),
    second = update('worker-two');
  function simulatedCommit(plan) {
    if (plan.expectedBlobSha !== currentSha) throw new Error('CONFLICT');
    committed = JSON.parse(plan.content);
    const bytes = Buffer.from(plan.content);
    currentSha = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
  }
  simulatedCommit(first);
  assert.throws(() => simulatedCommit(second), /CONFLICT/);
  assert.equal(committed.lease.holder, 'worker-one');
});

test('missing or malformed worker identifiers cannot create a claim', () => {
  for (const field of ['holder', 'id']) {
    for (const value of [undefined, null, 12, '', 'invalid space']) {
      const s = fresh(),
        e = {
          type: 'claim',
          now: T0,
          holder: 'vector-run-1',
          id: 'claim-1',
          ttlMs: 1000,
          observedHead: s.checkpoint.sourceCommit,
        };
      e[field] = value;
      rejects('INVALID_CLAIM', () => transition(s, e));
    }
  }
});
test('object-key reordering alone cannot renew a lease', () => {
  const s = claim(),
    checkpoint = Object.fromEntries(Object.entries(s.checkpoint).reverse());
  checkpoint.checkedAt = T1;
  rejects('NO_MEANINGFUL_CHANGE', () =>
    transition(s, event(s, 'checkpoint', { checkpoint, ttlMs: 1000 })),
  );
});
test('future and backdated checkpoints are rejected', () => {
  const future = fresh();
  future.checkpoint.checkedAt = EXPIRED;
  rejects('FUTURE_CHECKPOINT', () => claim(future));
  const s = claim(),
    updated = transition(s, event(s, 'checkpoint'));
  rejects('OLDER_CHECKPOINT', () =>
    transition(
      updated,
      event(updated, 'checkpoint', {
        now: T2,
        checkpoint: {
          ...cp(updated, 'A different next action'),
          checkedAt: T0,
        },
      }),
    ),
  );
});
test('normalized URL traversal and query-bearing evidence are rejected', () => {
  for (const tail of [
    '../../another-repository',
    '%2e%2e/another-repository',
    'pull/238?token=NOT_A_SECRET',
  ]) {
    const s = fresh();
    s.checkpoint.evidence = [
      'https:' + '//github.com/quantrinitylab/Quant-Ecosystem/' + tail,
    ];
    rejects('NON_PROJECT_EVIDENCE', () => validateTask(s));
  }
});
test('generation and positive integer TTL requirements are checked', () => {
  const invalid = fresh();
  invalid.fence = -1;
  rejects('INVALID_GENERATION', () => validateTask(invalid));
  for (const ttlMs of [0, -1, 1.5, Infinity]) {
    const s = fresh();
    rejects('INVALID_TTL', () =>
      transition(s, {
        type: 'claim',
        now: T0,
        holder: 'vector-run-1',
        id: 'claim-1',
        ttlMs,
        observedHead: s.checkpoint.sourceCommit,
      }),
    );
  }
});
test('state survives a JSON round trip with the same active claim', () => {
  const s = claim(),
    persisted = JSON.parse(JSON.stringify(s));
  validateTask(persisted);
  assert.deepEqual(claimToken(persisted), claimToken(s));
});

test('symlinked CLI validates positive input and rejects malformed input with exit 1', () => {
  const dir = mkdtempSync(join(process.cwd(), '.agent-team-cli-test-'));
  try {
    const link = join(dir, 'coordination.mjs');
    symlinkSync(
      fileURLToPath(new URL('./coordination.mjs', import.meta.url)),
      link,
    );
    const positive = spawnSync(
      process.execPath,
      [
        link,
        'validate',
        fileURLToPath(new URL('./tasks/QM-CI-238.json', import.meta.url)),
      ],
      { encoding: 'utf8' },
    );
    assert.equal(positive.status, 0);
    assert.match(positive.stdout, /Valid working-context task: QM-CI-238/);
    const invalid = join(dir, 'invalid.json');
    const state = fresh();
    state.extra = 'REJECT_THIS_FIELD';
    writeFileSync(invalid, JSON.stringify(state));
    const negative = spawnSync(process.execPath, [link, 'validate', invalid], {
      encoding: 'utf8',
    });
    assert.equal(negative.status, 1);
    assert.match(negative.stderr, /UNKNOWN_FIELD/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('importing the module does not invoke its CLI', () => {
  const expression =
    'await import(' +
    JSON.stringify(new URL('./coordination.mjs', import.meta.url).href) +
    ');';
  const imported = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', expression],
    { encoding: 'utf8' },
  );
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
});
