import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The tab talks to the same-origin Next proxy via @quant/api-client.
// Stub it so these tests run without the backend and the dismiss outcomes
// are controllable per test.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import {
  SecurityTab,
  dismissDependabotAlertOnServer,
  dismissCodeqlAlertOnServer,
} from '../app/quantgit/components/SecurityTab';

function mockResponse(ok: boolean, jsonBody: unknown): Response {
  return {
    ok,
    json: async () => jsonBody,
  } as Response;
}

describe('SecurityTab dismiss wiring (fix/qm-securitytab-theater-wire)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchRaw).mockReset();
  });

  // ---------------------------------------------------------------------------
  // dismissDependabotAlertOnServer — the real backend call behind Dismiss
  // ---------------------------------------------------------------------------
  describe('dismissDependabotAlertOnServer', () => {
    it('POSTs to /api/repos/:repoId/security/dependabot/:alertId/dismiss', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, {
          success: true,
          data: {
            alertId: 'dep-1',
            state: 'dismissed',
            dismissedReason: 'Risk accepted',
            message: 'Dependabot alert dismissed (Risk accepted).',
          },
        }),
      );

      const result = await dismissDependabotAlertOnServer('repo-9', 'dep-1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo-9/security/dependabot/dep-1/dismiss',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Risk accepted' }),
        }),
      );
      expect(result).toEqual({
        ok: true,
        message: 'Dependabot alert dismissed (Risk accepted).',
      });
    });

    it('URL-encodes repo and alert ids', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, {
          success: true,
          data: { state: 'dismissed', message: 'Dependabot alert dismissed (Risk accepted).' },
        }),
      );

      await dismissDependabotAlertOnServer('repo/with slash', 'dep 1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo%2Fwith%20slash/security/dependabot/dep%201/dismiss',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns ok:false with the backend 404 message when the alert is unknown', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(false, {
          success: false,
          error: {
            code: 'ALERT_NOT_FOUND',
            message: 'Dependabot alert not found',
            statusCode: 404,
          },
        }),
      );

      const result = await dismissDependabotAlertOnServer('repo-9', 'nope');

      // No state flip, no success toast — caller must show this honest message.
      expect(result).toEqual({ ok: false, message: 'Dependabot alert not found' });
    });

    it('returns ok:false when the envelope is not a confirmed dismissal', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, { success: true, data: { state: 'open' } }),
      );

      const result = await dismissDependabotAlertOnServer('repo-9', 'dep-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/Nothing was changed/);
    });

    it('returns ok:false with an honest message on network failure', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new TypeError('fetch failed'));

      const result = await dismissDependabotAlertOnServer('repo-9', 'dep-1');

      expect(result).toEqual({
        ok: false,
        message: 'Dismiss request failed — the alert was not dismissed. Nothing was changed.',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // dismissCodeqlAlertOnServer — the real backend call behind Dismiss
  // ---------------------------------------------------------------------------
  describe('dismissCodeqlAlertOnServer', () => {
    it('POSTs to /api/repos/:repoId/security/codeql/:alertId/dismiss', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, {
          success: true,
          data: {
            alertId: 'cq-1',
            state: 'dismissed',
            message: 'CodeQL alert dismissed for sql-injection.',
          },
        }),
      );

      const result = await dismissCodeqlAlertOnServer('repo-9', 'cq-1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo-9/security/codeql/cq-1/dismiss',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual({
        ok: true,
        message: 'CodeQL alert dismissed for sql-injection.',
      });
    });

    it('returns ok:false with the backend 404 message when the alert is unknown', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(false, {
          success: false,
          error: {
            code: 'ALERT_NOT_FOUND',
            message: 'CodeQL alert not found',
            statusCode: 404,
          },
        }),
      );

      const result = await dismissCodeqlAlertOnServer('repo-9', 'nope');

      expect(result).toEqual({ ok: false, message: 'CodeQL alert not found' });
    });

    it('returns ok:false when the envelope is not a confirmed dismissal', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, { success: true, data: { state: 'open' } }),
      );

      const result = await dismissCodeqlAlertOnServer('repo-9', 'cq-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/Nothing was changed/);
    });

    it('returns ok:false with an honest message when the body is not JSON', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      } as Response);

      const result = await dismissCodeqlAlertOnServer('repo-9', 'cq-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/Nothing was changed/);
    });

    it('returns ok:false with an honest message on network failure', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new TypeError('fetch failed'));

      const result = await dismissCodeqlAlertOnServer('repo-9', 'cq-1');

      expect(result).toEqual({
        ok: false,
        message: 'Dismiss request failed — the alert was not dismissed. Nothing was changed.',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Static render — dismiss buttons still render for open alerts
  // ---------------------------------------------------------------------------
  describe('static render', () => {
    it('renders the dependabot Dismiss button for an open alert', () => {
      const html = renderToStaticMarkup(
        <SecurityTab
          securityAlerts={[
            {
              id: 'dep-1',
              package: 'lodash',
              severity: 'high',
              cve: 'CVE-2026-0001',
              title: 'Prototype pollution',
              vulnerableRange: '< 4.17.21',
              patchedVersion: '4.17.21',
              state: 'open',
            } as never,
          ]}
          showToast={() => {}}
          repoId="repo-9"
        />,
      );
      expect(html).toContain('dismiss-alert-dep-1');
    });
  });
});
