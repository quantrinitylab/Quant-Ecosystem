/**
 * Multiple signatures (fix/qm-multiple-signatures).
 *
 * The backend has always carried a signature list with an `isDefault` flag;
 * the frontend never read it. These tests pin the new list reader:
 *
 * - `pickDefaultSignature` starts a fresh composer on the flagged default,
 *   falls back to the first in list order, and yields null for no list.
 * - `loadEmailSignatures` maps the API rows (pipe-stripped, like the
 *   default path), never rejects, and caches per session until
 *   `invalidateSignatures()` — so a save in Settings is picked up by the
 *   next composer instead of serving the stale list.
 *
 * Vitest runs in a node environment where `window` is undefined, so the
 * loader's SSR guard would short-circuit to [] — the tests stub
 * `globalThis.window` for the loader calls, which is exactly what the guard
 * checks at call time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadEmailSignatures,
  invalidateSignatures,
  pickDefaultSignature,
  type EmailSignatureOption,
} from '../email-signature-preference';

const getEmailSignatures = vi.fn();

vi.mock('../../services/api-client', () => ({
  apiClient: {
    getEmailSignatures: (...args: unknown[]) => getEmailSignatures(...args),
  },
}));

const FORMAL: EmailSignatureOption = {
  id: 'sig-formal',
  name: 'Formal',
  contentHtml: 'Best regards,<br>Alex',
  isDefault: true,
};

const CASUAL: EmailSignatureOption = {
  id: 'sig-casual',
  name: 'Casual',
  contentHtml: 'Cheers,<br>Alex',
  isDefault: false,
};

function apiRow(overrides: Partial<EmailSignatureOption> & { id: string }) {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Sig',
    contentHtml: overrides.contentHtml ?? 'Hi',
    isDefault: overrides.isDefault ?? false,
  };
}

describe('pickDefaultSignature', () => {
  it('picks the flagged default even when it is not first', () => {
    expect(pickDefaultSignature([CASUAL, FORMAL])).toBe(FORMAL);
  });

  it('falls back to the first signature when none is flagged', () => {
    expect(pickDefaultSignature([CASUAL])).toBe(CASUAL);
  });

  it('returns null for an empty list', () => {
    expect(pickDefaultSignature([])).toBeNull();
  });
});

describe('loadEmailSignatures', () => {
  beforeEach(() => {
    invalidateSignatures();
    getEmailSignatures.mockReset();
    (globalThis as unknown as { window: unknown }).window = {};
  });

  afterEach(() => {
    invalidateSignatures();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('maps API rows and strips a stray trailing pipe like the default path', async () => {
    getEmailSignatures.mockResolvedValue({
      success: true,
      data: [
        apiRow({ id: 'sig-formal', name: 'Formal', contentHtml: 'Best regards|', isDefault: true }),
        apiRow({ id: 'sig-casual', name: 'Casual', contentHtml: 'Cheers', isDefault: false }),
      ],
    });

    const options = await loadEmailSignatures();

    expect(options).toEqual([
      { id: 'sig-formal', name: 'Formal', contentHtml: 'Best regards', isDefault: true },
      { id: 'sig-casual', name: 'Casual', contentHtml: 'Cheers', isDefault: false },
    ]);
  });

  it('caches per session: the second call does not re-fetch', async () => {
    getEmailSignatures.mockResolvedValue({ success: true, data: [] });

    await loadEmailSignatures();
    await loadEmailSignatures();

    expect(getEmailSignatures).toHaveBeenCalledTimes(1);
  });

  it('refetches after invalidateSignatures', async () => {
    getEmailSignatures.mockResolvedValue({ success: true, data: [] });

    await loadEmailSignatures();
    invalidateSignatures();
    await loadEmailSignatures();

    expect(getEmailSignatures).toHaveBeenCalledTimes(2);
  });

  it('never rejects: an API failure yields an empty list', async () => {
    getEmailSignatures.mockRejectedValue(new Error('network down'));

    await expect(loadEmailSignatures()).resolves.toEqual([]);
  });

  it('an unsuccessful response yields an empty list', async () => {
    getEmailSignatures.mockResolvedValue({ success: false, data: null });

    await expect(loadEmailSignatures()).resolves.toEqual([]);
  });
});
