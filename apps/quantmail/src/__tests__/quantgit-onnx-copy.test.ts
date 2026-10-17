// Regression test: QuantGit demo fixtures must not claim unshipped local
// ONNX inference capabilities (drive drawer had the same class — fixed #1199).
// No package.json carries onnxruntime/ort and no ONNX code exists in
// apps/quantmail/src or backend/services, so any "ONNX" string in these
// fixtures is an invented capability claim. Honest demo copy only.
import { describe, it, expect } from 'vitest';
import {
  INITIAL_REPOS,
  MOCK_FILES,
  INITIAL_DISCUSSIONS,
} from '../app/(app)/quantgit/constants';

const UNSHIPPED_CAPABILITY = /onnx|onnxruntime|semantic search|vector embedding/i;

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(allStrings);
  return [];
}

describe('QuantGit fixture copy honesty (no unshipped inference claims)', () => {
  it('INITIAL_REPOS contains no ONNX / semantic-search / vector-embedding claims', () => {
    const hits = allStrings(INITIAL_REPOS).filter((s) =>
      UNSHIPPED_CAPABILITY.test(s),
    );
    expect(hits).toEqual([]);
  });

  it('quantmail-core description is honest about search and topics drop onnx', () => {
    const core = INITIAL_REPOS.find((r) => r.id === 'quantmail-core');
    expect(core).toBeDefined();
    expect(core!.description).not.toMatch(/onnx/i);
    expect(core!.description).toContain('full-text search');
    expect(core!.topics).not.toContain('onnx');
  });

  it('MOCK_FILES commit messages contain no ONNX / onnxruntime claims', () => {
    const hits = MOCK_FILES.filter((f) => UNSHIPPED_CAPABILITY.test(f.lastCommit));
    expect(hits.map((f) => `${f.path}: ${f.lastCommit}`)).toEqual([]);
  });

  it('INITIAL_DISCUSSIONS titles and bodies contain no ONNX runtime claims', () => {
    const hits = INITIAL_DISCUSSIONS.filter(
      (d) =>
        UNSHIPPED_CAPABILITY.test(d.title) || UNSHIPPED_CAPABILITY.test(d.body),
    );
    expect(hits.map((d) => d.title)).toEqual([]);
  });
});
