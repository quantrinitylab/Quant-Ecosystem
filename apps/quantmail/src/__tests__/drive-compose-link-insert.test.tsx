/**
 * Drive compose link insertion + send-time permission detector.
 *
 * Covers: reusing an existing active share link vs creating a viewer-only
 * `specific` link (insertion must never silently world-share), token scanning
 * of the body, the recipient-access computation, grant calls, and the picker /
 * dialog UI copy. All API state comes from mocked server responses — nothing
 * here invents sharing state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const apiFetchRaw = vi.fn();
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: (...args: unknown[]) => apiFetchRaw(...args),
}));

const driveLink = (overrides: Record<string, unknown> = {}) => ({
  id: 'l1',
  role: 'viewer',
  scope: 'anyone',
  audience: 'Anyone with the link',
  audienceEmails: [],
  audienceOrgs: [],
  requiresPassword: false,
  expiresAt: null,
  expired: false,
  createdAt: '2026-10-08T00:00:00Z',
  shareUrl: '/drive/share/tok123',
  ...overrides,
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

import {
  absoluteShareUrl,
  ensureInsertableDriveLink,
  extractDriveShareTokens,
  resolveDriveShareToken,
  fetchDriveFileAccess,
  computeDrivePermissionIssues,
  grantDriveViewAccess,
} from '../components/drive-compose-share';

describe('absoluteShareUrl', () => {
  it('builds the absolute URL the way LinkShareDialog does', () => {
    expect(absoluteShareUrl('/drive/share/tok123', 'https://quantmail.in')).toBe(
      'https://quantmail.in/drive/share/tok123',
    );
  });
});

describe('extractDriveShareTokens', () => {
  it('finds relative and absolute share URLs and dedupes', () => {
    const body =
      'See [report](https://quantmail.in/drive/share/abc-123) and /drive/share/abc-123 again, plus /drive/share/xyz_9.';
    expect(extractDriveShareTokens(body)).toEqual(['abc-123', 'xyz_9']);
  });

  it('returns [] when the body has no Drive links', () => {
    expect(extractDriveShareTokens('hello https://example.com/x')).toEqual([]);
  });
});

describe('ensureInsertableDriveLink', () => {
  beforeEach(() => {
    apiFetchRaw.mockReset();
  });

  it('reuses an existing active anyone-scope link and creates nothing', async () => {
    apiFetchRaw.mockResolvedValue(jsonResponse({ links: [driveLink()] }));
    const link = await ensureInsertableDriveLink('f1', 'report.pdf', 'https://quantmail.in');
    expect(link.url).toBe('https://quantmail.in/drive/share/tok123');
    expect(link.scope).toBe('anyone');
    expect(apiFetchRaw).toHaveBeenCalledTimes(1);
    expect(apiFetchRaw.mock.calls[0][0]).toContain('/api/drive/files/f1/links');
  });

  it('skips expired links and creates a viewer-only specific link', async () => {
    apiFetchRaw.mockImplementation((url: string, init?: { method?: string }) => {
      if (url.includes('/links')) {
        return Promise.resolve(jsonResponse({ links: [driveLink({ expired: true })] }));
      }
      if (url === '/api/drive/shares/link' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({ share: driveLink({ id: 'l-new', scope: 'specific', shareUrl: '/drive/share/newtok' }) }),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    const link = await ensureInsertableDriveLink('f2', 'notes.txt', 'https://quantmail.in');
    expect(link.url).toBe('https://quantmail.in/drive/share/newtok');
    expect(link.scope).toBe('specific');
    const postCall = apiFetchRaw.mock.calls.find((c) => c[0] === '/api/drive/shares/link');
    expect(postCall).toBeDefined();
    const bodySent = JSON.parse(postCall![1].body);
    // Insertion must never silently world-share: specific scope, viewer role.
    expect(bodySent.scope).toBe('specific');
    expect(bodySent.role).toBe('viewer');
    expect(bodySent.fileId).toBe('f2');
  });

  it('prefers a specific-scope link over creating a new one', async () => {
    apiFetchRaw.mockResolvedValue(
      jsonResponse({ links: [driveLink({ id: 'l-spec', scope: 'specific', shareUrl: '/drive/share/spec1', audienceEmails: ['a@x.com'] })] }),
    );
    const link = await ensureInsertableDriveLink('f3', 'deck.pdf', 'https://quantmail.in');
    expect(link.linkId).toBe('l-spec');
    expect(link.url).toBe('https://quantmail.in/drive/share/spec1');
    expect(apiFetchRaw).toHaveBeenCalledTimes(1);
  });
});

describe('resolveDriveShareToken', () => {
  beforeEach(() => {
    apiFetchRaw.mockReset();
  });

  it('resolves a token to file id, name and scope', async () => {
    apiFetchRaw.mockResolvedValue(
      jsonResponse({ success: true, file: { id: 'f9', name: 'budget.xlsx' }, scope: 'specific' }),
    );
    const r = await resolveDriveShareToken('tok9');
    expect(r).toEqual({ token: 'tok9', fileId: 'f9', fileName: 'budget.xlsx', scope: 'specific' });
  });

  it('throws the backend message verbatim when the link is dead', async () => {
    apiFetchRaw.mockResolvedValue(jsonResponse({ message: 'This share link has expired' }, false, 410));
    await expect(resolveDriveShareToken('dead')).rejects.toThrow('This share link has expired');
  });
});

describe('fetchDriveFileAccess', () => {
  beforeEach(() => {
    apiFetchRaw.mockReset();
  });

  it('unions link audiences and people-share emails', async () => {
    apiFetchRaw.mockImplementation((url: string) => {
      if (url.includes('/links')) {
        return Promise.resolve(
          jsonResponse({
            links: [driveLink({ scope: 'specific', audienceEmails: ['Link@X.com'], shareUrl: '/drive/share/s1' })],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({ shares: [{ email: 'Shared@Y.com', permission: 'view' }] }),
      );
    });
    const access = await fetchDriveFileAccess('f1');
    expect(access.anyoneCanOpen).toBe(false);
    expect(access.accessibleEmails.sort()).toEqual(['link@x.com', 'shared@y.com']);
    expect(access.peopleUnverifiable).toBe(false);
    expect(access.checkFailed).toBe(false);
  });

  it('marks anyoneCanOpen on an active anyone-scope link', async () => {
    apiFetchRaw.mockImplementation((url: string) => {
      if (url.includes('/links')) return Promise.resolve(jsonResponse({ links: [driveLink()] }));
      return Promise.resolve(jsonResponse({ shares: [] }));
    });
    const access = await fetchDriveFileAccess('f1');
    expect(access.anyoneCanOpen).toBe(true);
  });

  it('marks people shares unverifiable on 403 (not the file owner)', async () => {
    apiFetchRaw.mockImplementation((url: string) => {
      if (url.includes('/links'))
        return Promise.resolve(jsonResponse({ links: [driveLink({ scope: 'specific', shareUrl: '/drive/share/s1' })] }));
      return Promise.resolve(jsonResponse({ message: 'Only the owner can manage sharing' }, false, 403));
    });
    const access = await fetchDriveFileAccess('f1');
    expect(access.peopleUnverifiable).toBe(true);
    expect(access.checkFailed).toBe(false);
  });

  it('marks the check failed when the link list cannot be read', async () => {
    apiFetchRaw.mockRejectedValue(new Error('network down'));
    const access = await fetchDriveFileAccess('f1');
    expect(access.checkFailed).toBe(true);
  });

  it('marks the file missing on 404', async () => {
    apiFetchRaw.mockImplementation((url: string) => {
      if (url.includes('/links')) return Promise.resolve(jsonResponse({ links: [] }));
      return Promise.resolve(jsonResponse({ message: 'not found' }, false, 404));
    });
    const access = await fetchDriveFileAccess('f1');
    expect(access.fileMissing).toBe(true);
  });
});

describe('computeDrivePermissionIssues', () => {
  const baseAccess = {
    fileId: 'f1',
    anyoneCanOpen: false,
    accessibleEmails: ['a@x.com'],
    orgScoped: false,
    peopleUnverifiable: false,
    checkFailed: false,
    fileMissing: false,
  };

  it('returns null when everyone is covered', () => {
    expect(computeDrivePermissionIssues('r.pdf', 'f1', baseAccess, ['a@x.com'])).toBeNull();
  });

  it('returns null for an anyone-scope link', () => {
    expect(
      computeDrivePermissionIssues('r.pdf', 'f1', { ...baseAccess, anyoneCanOpen: true }, ['stranger@z.com']),
    ).toBeNull();
  });

  it('lists recipients who lack access', () => {
    const issue = computeDrivePermissionIssues('r.pdf', 'f1', baseAccess, ['a@x.com', 'b@y.com']);
    expect(issue).not.toBeNull();
    expect(issue!.missingEmails).toEqual(['b@y.com']);
    expect(issue!.broken).toBe(false);
  });

  it('dedupes and lowercases recipients', () => {
    const issue = computeDrivePermissionIssues('r.pdf', 'f1', baseAccess, ['A@X.com', 'a@x.com', ' B@Y.com ']);
    expect(issue!.missingEmails).toEqual(['b@y.com']);
  });

  it('returns null when there are no recipients', () => {
    expect(computeDrivePermissionIssues('r.pdf', 'f1', baseAccess, [])).toBeNull();
  });

  it('flags unverifiable access instead of claiming granted', () => {
    const issue = computeDrivePermissionIssues(
      'r.pdf',
      'f1',
      { ...baseAccess, peopleUnverifiable: true },
      ['a@x.com'],
    );
    expect(issue).not.toBeNull();
    expect(issue!.missingEmails).toEqual([]);
    expect(issue!.unverifiable).toBe(true);
  });

  it('flags a deleted file as broken, not as an access issue', () => {
    const issue = computeDrivePermissionIssues(
      'r.pdf',
      'f1',
      { ...baseAccess, fileMissing: true },
      ['a@x.com'],
    );
    expect(issue!.broken).toBe(true);
    expect(issue!.brokenMessage).toContain('no longer exists');
  });

  it('flags an unreadable check as unverifiable', () => {
    const issue = computeDrivePermissionIssues(
      'r.pdf',
      'f1',
      { ...baseAccess, checkFailed: true },
      ['a@x.com'],
    );
    expect(issue!.unverifiable).toBe(true);
    expect(issue!.broken).toBe(false);
  });
});

describe('grantDriveViewAccess', () => {
  beforeEach(() => {
    apiFetchRaw.mockReset();
  });

  it('posts one view grant per email and reports successes', async () => {
    apiFetchRaw.mockResolvedValue(jsonResponse({ ok: true }));
    const result = await grantDriveViewAccess('f1', ['a@x.com', 'b@y.com']);
    expect(result.granted).toEqual(['a@x.com', 'b@y.com']);
    expect(result.failed).toEqual([]);
    expect(apiFetchRaw).toHaveBeenCalledTimes(2);
    const first = apiFetchRaw.mock.calls[0];
    expect(first[0]).toBe('/api/drive/files/f1/share');
    expect(first[1].method).toBe('POST');
    expect(JSON.parse(first[1].body)).toEqual({ email: 'a@x.com', permission: 'view' });
  });

  it('collects per-email failures with the backend message', async () => {
    apiFetchRaw.mockImplementation((url: string, init?: { body?: string }) => {
      const email = JSON.parse(init?.body ?? '{}').email;
      if (email === 'b@y.com')
        return Promise.resolve(jsonResponse({ message: 'Only the owner can manage sharing' }, false, 403));
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const result = await grantDriveViewAccess('f1', ['a@x.com', 'b@y.com']);
    expect(result.granted).toEqual(['a@x.com']);
    expect(result.failed).toEqual([
      { email: 'b@y.com', error: 'Only the owner can manage sharing' },
    ]);
  });
});
