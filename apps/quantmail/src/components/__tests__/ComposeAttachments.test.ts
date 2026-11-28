import { describe, it, expect } from 'vitest';
import { decideAttachmentFiles, dragCarriesFiles } from '../composeAttachments';

// decideAttachmentFiles only reads `.size` off each entry, so plain
// stand-ins keep the tests independent of a DOM File implementation.
const MB = 1024 * 1024;
const file = (name: string, size: number) => ({ name, size }) as unknown as File;

describe('decideAttachmentFiles (shared picker + drag-and-drop admission)', () => {
  it('accepts files that fit inside both caps', () => {
    const decision = decideAttachmentFiles(
      [file('a.pdf', 2 * MB), file('b.png', 3 * MB)],
      0,
      20 * MB,
      25 * MB,
      false,
    );
    expect(decision.accepted.map((f) => (f as unknown as { name: string }).name)).toEqual([
      'a.pdf',
      'b.png',
    ]);
    expect(decision.tooBig).toEqual([]);
    expect(decision.overBudget).toEqual([]);
    expect(decision.stoppedAtBudget).toBe(false);
  });

  it('refuses a file over the per-file cap without counting it toward the total', () => {
    const decision = decideAttachmentFiles(
      [file('big.mp4', 21 * MB), file('small.txt', 1 * MB)],
      0,
      20 * MB,
      25 * MB,
      false,
    );
    expect(decision.accepted.map((f) => (f as unknown as { name: string }).name)).toEqual([
      'small.txt',
    ]);
    expect(decision.tooBig.map((f) => (f as unknown as { name: string }).name)).toEqual(['big.mp4']);
    expect(decision.overBudget).toEqual([]);
  });

  it('counts already-attached bytes against the total cap', () => {
    const decision = decideAttachmentFiles([file('c.pdf', 2 * MB)], 24 * MB, 20 * MB, 25 * MB, false);
    expect(decision.accepted).toEqual([]);
    expect(decision.overBudget.map((f) => (f as unknown as { name: string }).name)).toEqual([
      'c.pdf',
    ]);
  });

  it('without stopAtBudget keeps scanning so a later smaller file can still fit (EmailComposer picker)', () => {
    const decision = decideAttachmentFiles(
      [file('first.bin', 10 * MB), file('second.bin', 20 * MB), file('third.txt', 1 * MB)],
      10 * MB,
      20 * MB,
      25 * MB,
      false,
    );
    expect(decision.accepted.map((f) => (f as unknown as { name: string }).name)).toEqual([
      'first.bin',
      'third.txt',
    ]);
    expect(decision.overBudget.map((f) => (f as unknown as { name: string }).name)).toEqual([
      'second.bin',
    ]);
    expect(decision.stoppedAtBudget).toBe(false);
  });

  it('with stopAtBudget stops at the first over-budget file (DockedComposer picker)', () => {
    const decision = decideAttachmentFiles(
      [file('first.bin', 10 * MB), file('second.bin', 20 * MB), file('third.txt', 1 * MB)],
      10 * MB,
      20 * MB,
      25 * MB,
      true,
    );
    expect(decision.accepted.map((f) => (f as unknown as { name: string }).name)).toEqual([
      'first.bin',
    ]);
    expect(decision.overBudget.map((f) => (f as unknown as { name: string }).name)).toEqual([
      'second.bin',
    ]);
    expect(decision.stoppedAtBudget).toBe(true);
  });

  it('accepts a file exactly at both caps (boundary is inclusive)', () => {
    const decision = decideAttachmentFiles([file('exact.bin', 20 * MB)], 5 * MB, 20 * MB, 25 * MB, false);
    expect(decision.accepted).toHaveLength(1);
    expect(decision.tooBig).toEqual([]);
    expect(decision.overBudget).toEqual([]);
  });

  it('accepts an empty selection', () => {
    const decision = decideAttachmentFiles([], 0, 20 * MB, 25 * MB, false);
    expect(decision).toEqual({ accepted: [], tooBig: [], overBudget: [], stoppedAtBudget: false });
  });
});

describe('dragCarriesFiles', () => {
  it('is true when the drag types include Files', () => {
    expect(dragCarriesFiles({ types: ['Files'] })).toBe(true);
    expect(dragCarriesFiles({ types: ['text/plain', 'Files'] })).toBe(true);
  });

  it('is false for text/link drags and for missing transfers', () => {
    expect(dragCarriesFiles({ types: ['text/plain'] })).toBe(false);
    expect(dragCarriesFiles({ types: [] })).toBe(false);
    expect(dragCarriesFiles(null)).toBe(false);
    expect(dragCarriesFiles(undefined)).toBe(false);
    expect(dragCarriesFiles({})).toBe(false);
  });
});
