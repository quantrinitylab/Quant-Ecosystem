/**
 * QM-M39-006 (M39 screen 22): LinkShareDialog honesty + confirmation tests.
 *
 * The dialog must never claim a link exists before the server confirms it,
 * must show expired links as expired (never "Active"), and must route every
 * create/update/revoke through an explicit confirmation step.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@quant/shared-ui', () => ({
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('../../../components/InboxToast', () => ({
  showToast: vi.fn(),
}));

const apiFetchRaw = vi.fn();
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: (...args: unknown[]) => apiFetchRaw(...args),
}));

import { LinkShareDialog } from '../app/drive/components/LinkShareDialog';
import {
  createDriveLink,
  revokeDriveLink,
  fetchDriveLinks,
} from '../app/drive/components/link-share-api';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('LinkShareDialog (honest states)', () => {
  it('renders the link-sharing header and an honest loading state', () => {
    const html = renderToStaticMarkup(
      <LinkShareDialog fileId="file-1" fileName="report.pdf" />,
    );
    expect(html).toContain('Link sharing');
    expect(html).toContain('+ New link');
    // Honest: the list is fetched, never assumed.
    expect(html).toContain('Loading share links…');
    expect(html).not.toContain('Active');
  });

  it('does not render the scope picker before the user starts creating', () => {
    const html = renderToStaticMarkup(
      <LinkShareDialog fileId="file-1" fileName="report.pdf" />,
    );
    expect(html).not.toContain('Anyone with the link');
    expect(html).not.toContain('Specific people');
  });
});

describe('link-share-api (no invented state)', () => {
  beforeEach(() => {
    apiFetchRaw.mockReset();
  });

  it('fetchDriveLinks returns the server list verbatim', async () => {
    const serverLinks = [
      {
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
      },
    ];
    apiFetchRaw.mockResolvedValue(jsonResponse({ links: serverLinks }));
    const links = await fetchDriveLinks('file-1');
    expect(links).toEqual(serverLinks);
    expect(apiFetchRaw).toHaveBeenCalledWith('/api/drive/files/file-1/links');
  });

  it('fetchDriveLinks throws the backend message on failure', async () => {
    apiFetchRaw.mockResolvedValue(
      jsonResponse({ success: false, message: 'Only the owner can manage sharing' }, false, 403),
    );
    await expect(fetchDriveLinks('file-1')).rejects.toThrow('Only the owner can manage sharing');
  });

  it('createDriveLink sends scope/audience/expiry and throws without inventing a link', async () => {
    apiFetchRaw.mockResolvedValue(jsonResponse({ success: true, share: { id: 'x' } }));
    await expect(
      createDriveLink('file-1', {
        scope: 'specific',
        audienceEmails: ['a@example.com'],
        role: 'viewer',
        expiresDate: '2026-10-20',
      }),
    ).rejects.toThrow('Server did not return a share link');
    const [, init] = apiFetchRaw.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.scope).toBe('specific');
    expect(body.audienceEmails).toEqual(['a@example.com']);
    expect(body.expiresAt).toBe('2026-10-20');
    expect(body.role).toBe('viewer');
  });

  it('createDriveLink returns the server-confirmed link', async () => {
    const share = { id: 'l9', shareUrl: '/drive/share/tok9' };
    apiFetchRaw.mockResolvedValue(jsonResponse({ success: true, share }));
    const result = await createDriveLink('file-1', {
      scope: 'anyone',
      audienceEmails: [],
      role: 'editor',
      expiresDate: null,
    });
    expect(result).toEqual(share);
  });

  it('revokeDriveLink throws the backend message instead of pretending', async () => {
    apiFetchRaw.mockResolvedValue(
      jsonResponse({ success: false, message: 'Share link not found' }, false, 404),
    );
    await expect(revokeDriveLink('missing')).rejects.toThrow('Share link not found');
    expect(apiFetchRaw).toHaveBeenCalledWith('/api/drive/shares/link?id=missing', {
      method: 'DELETE',
    });
  });
});
