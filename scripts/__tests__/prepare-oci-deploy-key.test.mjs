import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(root, 'scripts/prepare-oci-deploy-key.sh');

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'quant-oci-key-test-'));
  try {
    const path = join(directory, 'generated-test-key');
    const generated = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path]);
    assert.equal(generated.status, 0, 'test-only key generation must succeed');
    return run({ directory, key: readFileSync(path, 'utf8') });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function prepare(directory, key) {
  const destination = join(directory, 'deploy-key');
  const result = spawnSync('bash', [script, destination], {
    encoding: 'utf8',
    env: { ...process.env, OCI_DEPLOY_SSH_KEY: key },
    timeout: 5_000,
  });
  return { destination, result };
}

test('negative control: the old no-final-LF write reproduces OpenSSH failure', () => {
  fixture(({ directory, key }) => {
    const path = join(directory, 'old-key-write');
    writeFileSync(path, key.trimEnd(), { mode: 0o600 });
    const result = spawnSync('ssh-keygen', ['-y', '-P', '', '-f', path], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'an unterminated key must reproduce the deploy failure');
  });
});

for (const [name, convert] of [
  ['canonical LF', (key) => key],
  ['missing final LF', (key) => key.trimEnd()],
  ['Windows CRLF', (key) => key.replaceAll('\n', '\r\n')],
]) {
  test(`prepares ${name} without logging key material`, () => {
    fixture(({ directory, key }) => {
      const { destination, result } = prepare(directory, convert(key));
      assert.equal(result.status, 0, 'key preparation must succeed');
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
      assert.equal(statSync(destination).mode & 0o777, 0o600);
      const prepared = readFileSync(destination, 'utf8');
      assert.ok(prepared.endsWith('\n'));
      assert.ok(!prepared.includes('\r'));
      const validation = spawnSync('ssh-keygen', ['-y', '-P', '', '-f', destination]);
      assert.equal(validation.status, 0, 'prepared key must be readable by OpenSSH');
    });
  });
}

for (const [name, convert] of [
  ['empty', () => ''],
  ['whitespace', () => ' \n'],
  ['truncated', (key) => key.slice(0, -45)],
  ['literal escaped newlines', (key) => key.replaceAll('\n', '\\n')],
  ['public key only', () => 'ssh-ed25519 AAAA invalid-config'],
]) {
  test(`rejects ${name} without installing a key or leaking its content`, () => {
    fixture(({ directory, key }) => {
      const input = convert(key);
      const { destination, result } = prepare(directory, input);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(destination), false);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /deployment stopped before SSH/);
      assert.ok(!result.stderr.includes('BEGIN OPENSSH PRIVATE KEY'));
    });
  });
}

test('rejects encrypted keys promptly rather than prompting on a runner', () => {
  fixture(({ directory }) => {
    const path = join(directory, 'encrypted-test-key');
    const generated = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', 'test-passphrase', '-f', path]);
    assert.equal(generated.status, 0);
    const { destination, result } = prepare(directory, readFileSync(path, 'utf8'));
    assert.equal(result.signal, null, 'validation must not hang until the timeout');
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(destination), false);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /deployment stopped before SSH/);
  });
});

test('workflow validates the key before network access and runs these tests in gate', () => {
  const deploy = readFileSync(join(root, '.github/workflows/deploy-oci.yml'), 'utf8');
  const gate = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const prepareIndex = deploy.indexOf('bash scripts/prepare-oci-deploy-key.sh');
  assert.ok(prepareIndex > 0);
  assert.ok(prepareIndex < deploy.indexOf('ssh-keyscan -H'));
  assert.ok(!deploy.includes('printf \'%s\' "$OCI_DEPLOY_SSH_KEY"'));
  assert.match(gate, /node --test scripts\/__tests__\/prepare-oci-deploy-key\.test\.mjs/);
});
