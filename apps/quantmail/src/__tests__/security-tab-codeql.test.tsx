import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The tab talks to the same-origin Next proxy via @quant/api-client.
// Stub it so these tests run without the backend and the codeql-fix outcomes
// are controllable per test.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import { SecurityTab, applyCodeqlFixOnServer, codeqlDiffHeaderLabel } from '../app/quantgit/components/SecurityTab';

const successEnvelope = {
  success: true,
  data: {
    alertId: 'codeql-1',
    status: 'fixed',
    message: 'CodeQL fix applied: parameterized the query.',
  },
};

function mockResponse(ok: boolean, jsonBody: unknown): Response {
  return {
    ok,
    json: async () => jsonBody,
  } as Response;
}

describe('SecurityTab codeql fix wiring (fix/qm-quantgit-codeql-toast)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchRaw).mockReset();
  });

  // ---------------------------------------------------------------------------
  // applyCodeqlFixOnServer — the real backend call behind "Apply recommended
  // fix". The button used to toast success with zero server contact; now a
  // success claim requires a confirmed server 'fixed' status.
  // ---------------------------------------------------------------------------
  describe('applyCodeqlFixOnServer', () => {
    it('POSTs to /api/repos/:repoId/security/codeql/:alertId/fix', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(mockResponse(true, successEnvelope));

      const result = await applyCodeqlFixOnServer('repo-9', 'codeql-1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo-9/security/codeql/codeql-1/fix',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual({ ok: true, message: 'CodeQL fix applied: parameterized the query.' });
    });

    it('URL-encodes repo and alert ids', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(mockResponse(true, successEnvelope));

      await applyCodeqlFixOnServer('repo/with slash', 'codeql 1');

      expect(apiFetchRaw).toHaveBeenCalledWith(
        '/api/repos/repo%2Fwith%20slash/security/codeql/codeql%201/fix',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns ok:false with the honest backend 501 message instead of claiming a patch', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(false, {
          success: false,
          error: {
            code: 'CODEQL_FIX_NOT_SUPPORTED',
            message:
              'CodeQL auto-fix is not wired up yet for rule "SQL Injection". No code was changed and no patch was applied.',
            statusCode: 501,
          },
        }),
      );

      const result = await applyCodeqlFixOnServer('repo-9', 'codeql-1');

      // No state flip, no success toast — caller must show this honest message.
      expect(result.ok).toBe(false);
      expect(result.message).toContain('not wired up yet');
      expect(result.message).toContain('No code was changed');
    });

    it('returns ok:false with the backend 404 message when the alert is unknown', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(false, {
          success: false,
          error: { code: 'ALERT_NOT_FOUND', message: 'CodeQL alert not found', statusCode: 404 },
        }),
      );

      const result = await applyCodeqlFixOnServer('repo-9', 'nope');

      expect(result).toEqual({ ok: false, message: 'CodeQL alert not found' });
    });

    it('returns ok:false when the envelope is not a confirmed fix', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue(
        mockResponse(true, { success: true, data: { status: 'open' } }),
      );

      const result = await applyCodeqlFixOnServer('repo-9', 'codeql-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/not wired up yet|No code was changed/);
    });

    it('returns ok:false with an honest message when the body is not JSON', async () => {
      vi.mocked(apiFetchRaw).mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      } as Response);

      const result = await applyCodeqlFixOnServer('repo-9', 'codeql-1');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/not wired up yet|No code was changed/);
    });

    it('returns ok:false with an honest message on network failure', async () => {
      vi.mocked(apiFetchRaw).mockRejectedValue(new TypeError('fetch failed'));

      const result = await applyCodeqlFixOnServer('repo-9', 'codeql-1');

      expect(result).toEqual({
        ok: false,
        message: 'Fix request failed — no code was changed and no patch was applied.',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Static render — honest "not wired up" empty state, no fabricated alerts,
  // no fabricated success toast copy anywhere on the surface.
  // ---------------------------------------------------------------------------
  describe('SecurityTab codeql sub-tab (static render)', () => {
    it('renders the honest not-wired-up empty state with zero alert cards', () => {
      const html = renderToStaticMarkup(<SecurityTab initialSubTab="codeql" repoId="repo-9" />);

      expect(html).toContain('SAST scanning isn');
      expect(html).not.toContain('codeql-apply-fix-');
      expect(html).not.toContain('codeql-card-');
      // The old fabricated success copy must not appear on the surface.
      expect(html).not.toContain('Applied recommended code patch');
      expect(html).not.toContain('Fix Applied');
    });
  });

  // ---------------------------------------------------------------------------
  // Honest copy (fix/qm-quantgit-securitytab-copy): the diff header must not
  // claim an automated patch is ready — the fix endpoint refuses with 501
  // until patch generation is wired up — and the status-checks row must not
  // claim CodeQL/Vitest enforcement that the backend never performs (it only
  // gates on the latest generic CI run reporting SUCCESS, with no per-check
  // selection anywhere in the UI or the branch-protection API).
  // ---------------------------------------------------------------------------
  describe('codeqlDiffHeaderLabel', () => {
    it('labels an open alert as a suggestion, never an automated patch', () => {
      expect(codeqlDiffHeaderLabel('open')).toBe('Suggested fix — not applied');
      expect(codeqlDiffHeaderLabel('dismissed')).toBe('Suggested fix — not applied');
    });

    it('labels a server-confirmed fixed alert as applied', () => {
      expect(codeqlDiffHeaderLabel('fixed')).toBe('Applied fix');
    });
  });

  describe('SecurityTab policy sub-tab (static render)', () => {
    it('describes status checks honestly, without CodeQL/Vitest enforcement claims', () => {
      const html = renderToStaticMarkup(<SecurityTab initialSubTab="policy" repoId="repo-9" />);

      expect(html).toContain('Require status checks to pass before merging');
      expect(html).toContain('does not by itself run CodeQL SAST or Vitest');
      expect(html).not.toContain('Automated Patch Ready');
      expect(html).not.toContain('Enforces');
      expect(html).not.toContain('100% green');
      expect(html).not.toContain('Choose which status checks must pass');
    });
  });
});
