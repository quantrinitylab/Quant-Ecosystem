/**
 * fix/qm-drive-dead-share-links — legacy document share URL redirect tests.
 *
 * Links issued before the /drive/share/<token> unification pointed at
 * /documents/public/share/<token>. They must redirect to the ONE canonical
 * landing page instead of 404ing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const redirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));

import LegacyDocumentShareRedirect from '../app/documents/public/share/[token]/page';

describe('legacy document share redirect', () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it('redirects a document share token to the canonical landing path', async () => {
    await LegacyDocumentShareRedirect({
      params: Promise.resolve({ token: 'doc_share_synthetic001' }),
    }).catch((e: Error) => {
      expect(e.message).toContain('NEXT_REDIRECT');
    });
    expect(redirect).toHaveBeenCalledWith('/drive/share/doc_share_synthetic001');
  });

  it('URL-encodes the token in the redirect target', async () => {
    await LegacyDocumentShareRedirect({
      params: Promise.resolve({ token: 'odd token/1' }),
    }).catch((e: Error) => {
      expect(e.message).toContain('NEXT_REDIRECT');
    });
    expect(redirect).toHaveBeenCalledWith('/drive/share/odd%20token%2F1');
  });
});
