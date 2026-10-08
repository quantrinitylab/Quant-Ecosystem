/**
 * Tests for the Drive permissions/access viewer (QM-M39-005, M39 screen 21).
 *
 * The viewer is READ-ONLY: it renders the current access state — collaborators
 * with roles, and link scope/audience/expiry — from real backend data. It must
 * never invent collaborators, links, or counts; with no backend data it shows
 * honest empty states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock the shared-ui Modal to render children inline (the real one portals
// to document.body, which renderToStaticMarkup cannot do).
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

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import { FileAccessView } from '../app/drive/components/FilePermissionsViewer';
import { fetchFileAccess } from '../app/drive/components/file-access-api';

const mockFetch = vi.mocked(apiFetchRaw);

const realData = {
  shares: [
    {
      id: 'share-1',
      email: 'teammate@example.com',
      permission: 'edit' as const,
      status: 'accepted',
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'share-2',
      email: 'pending@example.com',
      permission: 'view' as const,
      status: 'pending',
      createdAt: '2026-10-05T10:00:00.000Z',
    },
  ],
  links: [
    {
      id: 'link-1',
      role: 'viewer',
      audience: 'anyone_with_link',
      requiresPassword: false,
      expiresAt: '2026-11-08T10:00:00.000Z',
      expired: false,
      createdAt: '2026-10-01T10:00:00.000Z',
      shareUrl: '/drive/share/tok-1',
    },
    {
      id: 'link-2',
      role: 'editor',
      audience: 'anyone_with_link',
      requiresPassword: true,
      expiresAt: '2026-09-01T10:00:00.000Z',
      expired: true,
      createdAt: '2026-08-01T10:00:00.000Z',
      shareUrl: '/drive/share/tok-2',
    },
    {
      id: 'link-3',
      role: 'viewer',
      audience: 'anyone_with_link',
      requiresPassword: false,
      expiresAt: null,
      expired: false,
      createdAt: '2026-10-02T10:00:00.000Z',
      shareUrl: '/drive/share/tok-3',
    },
  ],
};

function renderView(props: Partial<React.ComponentProps<typeof FileAccessView>> = {}) {
  return renderToStaticMarkup(
    <FileAccessView
      fileName="report.pdf"
      data={realData}
      loading={false}
      error={null}
      onRetry={() => {}}
      onManageSharing={() => {}}
      {...props}
    />,
  );
}

describe('FileAccessView (read-only access rendering)', () => {
  it('renders each collaborator with their email and role', () => {
    const html = renderView();
    expect(html).toContain('teammate@example.com');
    expect(html).toContain('Can edit');
    expect(html).toContain('pending@example.com');
    expect(html).toContain('Can view');
  });

  it('marks invites that have not been accepted yet', () => {
    const html = renderView();
    expect(html).toContain('Invite sent — not accepted yet');
  });

  it('shows an honest empty state when nobody else has access', () => {
    const html = renderView({ data: { shares: [], links: [] } });
    expect(html).toContain('No one else has access to');
    expect(html).toContain('report.pdf');
    // No invented rows: neither collaborator email may appear.
    expect(html).not.toContain('teammate@example.com');
    expect(html).not.toContain('pending@example.com');
  });

  it('renders link rows with audience, role, expiry, and password state', () => {
    const html = renderView();
    expect(html).toContain('Anyone with the link');
    expect(html).toContain('Expires');
    expect(html).toContain('Expired');
    expect(html).toContain('No expiry set');
    expect(html).toContain('Password protected');
  });

  it('shows an honest empty state when there are no share links', () => {
    const html = renderView({ data: { shares: realData.shares, links: [] } });
    expect(html).toContain('No share links for');
    expect(html).not.toContain('Anyone with the link');
  });

  it('separates current access from changes: offers Manage sharing, never edit controls', () => {
    const html = renderView();
    expect(html).toContain('Manage sharing');
    expect(html).toContain('Current access for this file');
    // No inline editing affordances in the read-only view.
    expect(html).not.toContain('Create Link');
    expect(html).not.toContain('type="email"');
  });

  it('renders the loading state while access data is being fetched', () => {
    const html = renderView({ loading: true, data: null });
    expect(html).toContain('Loading access information');
    expect(html).not.toContain('teammate@example.com');
  });

  it('renders the error state with a retry action', () => {
    const html = renderView({
      loading: false,
      data: null,
      error: 'Only the owner can manage sharing',
    });
    expect(html).toContain('Only the owner can manage sharing');
    expect(html).toContain('Try again');
  });
});

describe('fetchFileAccess (real backend data, no invention)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      json: async () => body,
    } as Response;
  }

  it('combines collaborator and link data from the two real endpoints', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ shares: realData.shares }))
      .mockResolvedValueOnce(jsonResponse({ links: realData.links }));

    const data = await fetchFileAccess('file-123');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/drive/files/file-123/share');
    expect(mockFetch.mock.calls[1][0]).toBe('/api/drive/files/file-123/links');
    expect(data.shares).toHaveLength(2);
    expect(data.links).toHaveLength(3);
    expect(data.shares[0].email).toBe('teammate@example.com');
    expect(data.links[0].audience).toBe('anyone_with_link');
  });

  it('returns empty arrays — not invented entries — when the backend has no data', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ shares: [] }))
      .mockResolvedValueOnce(jsonResponse({ links: [] }));

    const data = await fetchFileAccess('file-123');
    expect(data).toEqual({ shares: [], links: [] });
  });

  it('throws the backend message when the viewer is not allowed (e.g. non-owner 403)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: 'Only the owner can manage sharing' }, false, 403))
      .mockResolvedValueOnce(jsonResponse({ links: [] }));

    await expect(fetchFileAccess('file-123')).rejects.toThrow('Only the owner can manage sharing');
  });
});
