// Mail polish (live walkthrough 2026-10-13):
//   • a draft-only row resumes the draft in the composer instead of opening an
//     empty thread view (search and All mail surface drafts);
//   • the swipe tip is shown only where the swipe exists (touch).
import { describe, expect, it } from 'vitest';
import { isDraftOnlyConversation } from '../lib/threading';
import { isTouchPrimary } from '../components/SwipeHint';

describe('isDraftOnlyConversation', () => {
  it('is true for a lone draft and for a thread made only of drafts', () => {
    expect(isDraftOnlyConversation({ isDraft: true })).toBe(true);
    expect(isDraftOnlyConversation({ isDraft: true }, [])).toBe(true);
    expect(isDraftOnlyConversation({ isDraft: true }, [{ isDraft: true }, { isDraft: true }])).toBe(
      true,
    );
  });

  it('is false when the row is a real conversation (or not a draft at all)', () => {
    expect(isDraftOnlyConversation({ isDraft: true }, [{ isDraft: false }, { isDraft: true }])).toBe(
      false,
    );
    expect(isDraftOnlyConversation({ isDraft: false })).toBe(false);
    expect(isDraftOnlyConversation(null)).toBe(false);
    expect(isDraftOnlyConversation(undefined, [{ isDraft: true }])).toBe(false);
  });
});

describe('isTouchPrimary (SwipeHint gate)', () => {
  const win = (coarse: boolean) =>
    ({ matchMedia: (q: string) => ({ matches: coarse && q === '(pointer: coarse)' }) }) as unknown as Pick<
      Window,
      'matchMedia'
    >;

  it('shows the swipe tip only for a finger', () => {
    expect(isTouchPrimary(win(true))).toBe(true);
    expect(isTouchPrimary(win(false))).toBe(false);
  });

  it('reads a missing or throwing matchMedia as "not touch"', () => {
    expect(isTouchPrimary(undefined)).toBe(false);
    expect(isTouchPrimary({} as Pick<Window, 'matchMedia'>)).toBe(false);
    expect(
      isTouchPrimary({
        matchMedia: () => {
          throw new Error('no');
        },
      } as unknown as Pick<Window, 'matchMedia'>),
    ).toBe(false);
  });
});
