/**
 * QuantDrivePickerModal insert-as-link path + DrivePermissionDialog copy.
 *
 * The picker must offer BOTH insert modes (Gmail parity): live-link insert
 * and attachment copies. The detector dialog must name the recipients who
 * lack access and offer the grant / send-without / keep-editing choices.
 *
 * NOTE: no JSX in this file — the quantmail vitest transform cannot parse
 * JSX in test files, so we use React.createElement like the sibling suites.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../hooks/useDrive', () => ({
  useDrive: () => ({
    files: [
      {
        id: 'f1',
        name: 'report.pdf',
        type: 'file',
        mimeType: 'application/pdf',
        size: 1024,
        path: '/',
        parentId: null,
        modifiedAt: '2026-10-14T00:00:00Z',
        owner: { name: 'Me', email: 'me@quantmail.in' },
        sharedWith: [],
        isStarred: false,
        versions: [],
      },
    ],
    loading: false,
    fetchFiles: vi.fn(),
  }),
}));

import { QuantDrivePickerModal } from '../components/QuantDrivePickerModal';
import { DrivePermissionDialog } from '../components/DrivePermissionDialog';

describe('QuantDrivePickerModal (both insert modes)', () => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onSelectFiles: vi.fn(),
    onInsertAsLink: vi.fn(),
  };

  it('offers both "Insert as link" and "Attach copies"', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantDrivePickerModal, { ...props }),
    );
    expect(html).toContain('Insert as link');
    expect(html).toContain('Attach copies');
    expect(html).not.toContain('Insert Attached');
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantDrivePickerModal, { ...props, isOpen: false }),
    );
    expect(html).toBe('');
  });

  it('keeps the honest picker copy', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantDrivePickerModal, { ...props }),
    );
    expect(html).toContain('Insert files using QuantDrive');
  });
});

describe('DrivePermissionDialog', () => {
  const base = {
    isOpen: true,
    busy: false,
    error: null as string | null,
    canGrant: true,
    onGrantAndSend: vi.fn(),
    onSendWithout: vi.fn(),
    onKeepEditing: vi.fn(),
  };

  it('names the recipients who lack access', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrivePermissionDialog, {
        ...base,
        issues: [
          {
            fileId: 'f1',
            fileName: 'report.pdf',
            missingEmails: ['a@x.com', 'b@y.com'],
            unverifiable: false,
            broken: false,
          },
        ],
      }),
    );
    expect(html).toContain('report.pdf');
    expect(html).toContain('a@x.com, b@y.com');
    expect(html).toContain('Grant access &amp; send');
    expect(html).toContain('Send without access');
    expect(html).toContain('Keep editing');
  });

  it('labels unverifiable files honestly instead of claiming access', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrivePermissionDialog, {
        ...base,
        issues: [
          {
            fileId: 'f1',
            fileName: 'deck.pdf',
            missingEmails: [],
            unverifiable: true,
            broken: false,
          },
        ],
      }),
    );
    expect(html).toContain('deck.pdf');
    expect(html).toContain('couldn&#x27;t be fully verified');
  });

  it('shows broken-link issues with the backend message', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrivePermissionDialog, {
        ...base,
        canGrant: false,
        issues: [
          {
            fileId: null,
            fileName: 'Drive link',
            missingEmails: [],
            unverifiable: false,
            broken: true,
            brokenMessage: 'This share link has expired',
          },
        ],
      }),
    );
    expect(html).toContain('This share link has expired');
    expect(html).toContain('no longer works');
  });

  it('disables the grant button when there is nothing to grant', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrivePermissionDialog, {
        ...base,
        canGrant: false,
        issues: [
          {
            fileId: null,
            fileName: 'Drive link',
            missingEmails: [],
            unverifiable: false,
            broken: true,
            brokenMessage: 'Share link not found',
          },
        ],
      }),
    );
    // The grant button must be present but disabled — never offer a grant that cannot run.
    const grantIdx = html.indexOf('Grant access');
    expect(grantIdx).toBeGreaterThan(-1);
    expect(html.slice(Math.max(0, grantIdx - 200), grantIdx)).toContain('disabled');
  });

  it('surfaces grant errors honestly', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrivePermissionDialog, {
        ...base,
        error: 'Could not grant access to everyone (b@y.com: Only the owner can manage sharing).',
        issues: [
          {
            fileId: 'f1',
            fileName: 'report.pdf',
            missingEmails: ['b@y.com'],
            unverifiable: false,
            broken: false,
          },
        ],
      }),
    );
    expect(html).toContain('Could not grant access to everyone');
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(DrivePermissionDialog, { ...base, isOpen: false, issues: [] }),
    );
    expect(html).toBe('');
  });
});
