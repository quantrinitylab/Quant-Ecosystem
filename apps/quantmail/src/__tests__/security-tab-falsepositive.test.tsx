import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The tab talks to the same-origin Next proxy via @quant/api-client.
// Stub it so these tests run without the backend and the false-positive
// outcomes are controllable per test.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import { SecurityTab, markSecretFalsePositiveOnServer } from '../app/quantgit/components/SecurityTab';

const successEnvelope = {
  success: true,
  data: {
    alertId: 'sec-1',
    status: 'false_positive',
    message: 'Secret alert marked as false positive.',
  },
};

function mockResponse(ok: boolean, jsonBody: unknown): Response {
  return {
    ok,
    json: async () => jsonBody,
  } as Response;
}

describe('SecurityTab false-positive wiring (fix/qm-quantgit-falsepositive-endpoint)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchRaw).mockReset();
  });

  // ---------------------------------------------------------------------------
  // markSecretFalsePositiveOnServer — the real backend call behind the button
  // ---------------------------------------------------------------------------
  describe('markSecretFalsePositiveOnServer', () => {
    it('POSTs to /api/repos/:repoId/security/secrets/:alertId/false-positive', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(mockResponse(true, successEnvelope));

      const result = await markSecretFalsePositiveOnServer('repo-9', 'sec-1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo-9/security/secrets/sec-1/false-positive',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual({ ok: true, message: 'Secret alert marked as false positive.' });
    });

    it('URL-encodes repo and alert ids', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(mockResponse(true, successEnvelope));

      await markSecretFalsePositiveOnServer('repo/with slash', 'sec 1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo%2Fwith%20slash/security/secrets/sec%201/false-positive',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns ok:false with the backend 404 message when the alert is unknown', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(false, {
          success: false,
          error: {
            code: 'ALERT_NOT_FOUND',
            message: 'Secret scanning alert not found',
            statusCode: 404,
          },
        }),
      );

      const result = await markSecretFalsePositiveOnServer('repo-9', 'nope');

      // No state flip, no success toast — caller must show this honest message.
      expect(result).toEqual({ ok: false, message: 'Secret scanning alert not found' });
    });

    it('returns ok:false when the envelope is not a confirmed false positive', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, { success: true, data: { status: 'active' } }),
      );

      const result = await markSecretFalsePositiveOnServer('repo-9', 'sec-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/not updated|Nothing was changed/);
    });

    it('returns ok:false with an honest message when the body is not JSON', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      } as Response);

      const result = await markSecretFalsePositiveOnServer('repo-9', 'sec-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/Nothing was changed/);
    });

    it('returns ok:false with an honest message on network failure', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new TypeError('fetch failed'));

      const result = await markSecretFalsePositiveOnServer('repo-9', 'sec-1');

      expect(result).toEqual({
        ok: false,
        message:
          'False-positive request failed — the alert was not updated. Nothing was changed.',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Static render — honest secrets empty state, no fabricated alerts
  // ---------------------------------------------------------------------------
  describe('SecurityTab secrets sub-tab (static render)', () => {
    it('renders the honest not-wired-up empty state with zero secret cards', () => {
      const html = renderToStaticMarkup(<SecurityTab initialSubTab="secrets" repoId="repo-9" />);

      expect(html).toContain('Secret scanning isn');
      expect(html).not.toContain('false-positive-btn-');
      expect(html).not.toContain('secret-card-');
    });

    it('renders without a selected repo (false-positive handler guards before any fetch)', () => {
      const html = renderToStaticMarkup(<SecurityTab initialSubTab="secrets" />);

      expect(html).toContain('secret-alerts-list');
    });
  });
});
