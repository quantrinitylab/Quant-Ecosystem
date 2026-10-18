// Regression test: QuantGit demo fixtures must not claim an unshipped
// 'rust-worker' capability on the quantmail-core demo repo. The repo's
// Rust WASM engines (engines/quant-{word,pdf,sheets,slides}) power
// Drive-side document rendering only — quantmail-core (the TypeScript
// mail client) has no Rust worker. Same invented-capability class as the
// ONNX claims (quantgit-onnx-copy.test.ts). Honest demo copy only.
import { describe, it, expect } from 'vitest';
import { INITIAL_REPOS, MOCK_FILES, INITIAL_DISCUSSIONS } from '../app/(app)/quantgit/constants';

const UNSHIPPED_RUST_CLAIM = /rust-worker|rust worker|rust_native|rusty-mail/i;

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(allStrings);
  return [];
}

describe('QuantGit fixture copy honesty (no unshipped rust-worker claims)', () => {
  it('INITIAL_REPOS contains no rust-worker / rust worker claims', () => {
    const hits = allStrings(INITIAL_REPOS).filter((s) =>
      UNSHIPPED_RUST_CLAIM.test(s),
    );
    expect(hits).toEqual([]);
  });

  it('quantmail-core topics keep only honest shipped topics', () => {
    const core = INITIAL_REPOS.find((r) => r.id === 'quantmail-core');
    expect(core).toBeDefined();
    expect(core!.topics).not.toContain('rust-worker');
    expect(core!.topics).toEqual(['email', 'privacy']);
  });

  it('MOCK_FILES commit messages contain no rust-worker claims', () => {
    const hits = MOCK_FILES.filter((f) =>
      UNSHIPPED_RUST_CLAIM.test(f.lastCommit),
    );
    expect(hits.map((f) => `${f.path}: ${f.lastCommit}`)).toEqual([]);
  });

  it('INITIAL_DISCUSSIONS titles and bodies contain no rust-worker claims', () => {
    const hits = INITIAL_DISCUSSIONS.filter(
      (d) =>
        UNSHIPPED_RUST_CLAIM.test(d.title) || UNSHIPPED_RUST_CLAIM.test(d.body),
    );
    expect(hits.map((d) => d.title)).toEqual([]);
  });
});
