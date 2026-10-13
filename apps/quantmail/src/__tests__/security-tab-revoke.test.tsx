import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The tab talks to the same-origin Next proxy via @quant/api-client.
// Stub it so these tests run without the backend and the revoke outcomes
// are controllable per test.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import { SecurityTab, revokeSecretOnServer } from '../app/quantgit/components/SecurityTab';

const successEnvelope = {
  success: true,
  data: {
    alertId: 'sec-1',
    status: 'revoked',
    message: 'Leaked credential successfully revoked.',
  },
};

function mockResponse(ok: boolean, jsonBody: unknown): Response {
  return {
    ok,
    json: async () => jsonBody,
  } as Response;
}

describe('SecurityTab revoke wiring (fix/qm-securitytab-revoke-real)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchRaw).mockReset();
  });

  // ---------------------------------------------------------------------------
  // revokeSecretOnServer — the real backend call behind the Revoke button
  // ---------------------------------------------------------------------------
  describe('revokeSecretOnServer', () => {
    it('POSTs to /api/repos/:repoId/security/secrets/:alertId/revoke', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(mockResponse(true, successEnvelope));

      const result = await revokeSecretOnServer('repo-9', 'sec-1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo-9/security/secrets/sec-1/revoke',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual({ ok: true, message: 'Leaked credential successfully revoked.' });
    });

    it('URL-encodes repo and alert ids', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(mockResponse(true, successEnvelope));

      await revokeSecretOnServer('repo/with slash', 'sec 1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo%2Fwith%20slash/security/secrets/sec%201/revoke',
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

      const result = await revokeSecretOnServer('repo-9', 'nope');

      // No state flip, no success toast — caller must show this honest message.
      expect(result).toEqual({ ok: false, message: 'Secret scanning alert not found' });
    });

    it('returns ok:false when the envelope is not a confirmed revoke', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, { success: true, data: { status: 'active' } }),
      );

      const result = await revokeSecretOnServer('repo-9', 'sec-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/still active/i);
    });

    it('returns ok:false with an honest message when the body is not JSON', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      } as Response);

      const result = await revokeSecretOnServer('repo-9', 'sec-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/still active|Nothing was changed/);
    });

    it('returns ok:false with an honest message on network failure', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new TypeError('fetch failed'));

      const result = await revokeSecretOnServer('repo-9', 'sec-1');

      expect(result).toEqual({
        ok: false,
        message: 'Revoke request failed — the credential is still active. Nothing was changed.',
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
      expect(html).not.toContain('revoke-token-btn-');
      expect(html).not.toContain('secret-card-');
    });

    it('renders without a selected repo (revoke handler guards before any fetch)', () => {
      const html = renderToStaticMarkup(<SecurityTab initialSubTab="secrets" />);

      expect(html).toContain('secret-alerts-list');
    });
  });
});
