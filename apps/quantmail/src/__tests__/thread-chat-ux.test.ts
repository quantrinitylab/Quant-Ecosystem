import { describe, expect, it } from 'vitest';
import { autoExpandedIndices } from '../components/ConversationalThreadView';
import type { Email } from '../types';

let seq = 0;

const msg = (over: Partial<Email> = {}): Email =>
  ({
    id: `msg-${++seq}`,
    messageKind: 'mail',
    bodyText: 'hello',
    ...over,
  }) as Email;

describe('autoExpandedIndices', () => {
  it('expands all chat-kind messages even in long threads', () => {
    const msgs = [
      msg({ messageKind: 'chat' }),
      msg({ messageKind: 'chat' }),
      msg({ messageKind: 'chat' }),
      msg({ messageKind: 'chat' }),
      msg({ messageKind: 'chat' }),
    ];
    expect(autoExpandedIndices(msgs)).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('keeps the mail rule: long mail threads open only the latest', () => {
    const msgs = [msg(), msg(), msg(), msg(), msg()];
    expect(autoExpandedIndices(msgs)).toEqual(new Set([4]));
  });

  it('keeps the mail rule: short threads (≤2) open everything', () => {
    expect(autoExpandedIndices([msg()])).toEqual(new Set([0]));
    expect(autoExpandedIndices([msg(), msg()])).toEqual(new Set([0, 1]));
  });

  it('mixed threads: all chat expanded plus the mail latest-rule', () => {
    const msgs = [
      msg({ messageKind: 'chat' }),
      msg({ messageKind: 'mail' }),
      msg({ messageKind: 'chat' }),
      msg({ messageKind: 'mail' }),
      msg({ messageKind: 'mail' }),
    ];
    // chat at 0 and 2 always expanded; mail rule adds latest (4)
    expect(autoExpandedIndices(msgs)).toEqual(new Set([0, 2, 4]));
  });

  it('mixed short thread: chat expanded and mail rule opens all', () => {
    const msgs = [msg({ messageKind: 'chat' }), msg({ messageKind: 'mail' })];
    expect(autoExpandedIndices(msgs)).toEqual(new Set([0, 1]));
  });

  it('empty thread returns empty set', () => {
    expect(autoExpandedIndices([])).toEqual(new Set());
  });
});
