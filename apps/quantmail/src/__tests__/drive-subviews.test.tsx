import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveContextTabsHeader,
  DriveFilesSubView,
  DriveSharedSubView,
  DriveSharedByMeSubView,
  DriveVaultSubView,
  DriveStarredSubView,
  DriveCleanerSubView,
  type DriveSubTab,
  type DriveItem,
} from '../app/drive/components';
import type { SentShareItem } from '../hooks/useDrive';

// The quota meter reads the real GET /api/drive/quota through this hook; the
// suite pins it to a known value instead of letting the meter fetch.
vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { used: 14.2 * 1024 ** 3, total: 100 * 1024 ** 3 },
    known: true,
    usedPct: 14,
    isLoading: false,
    error: null,
  }),
}));

describe('QuantDrive 5 Contextual Sub-Views Architect Test Suite', () => {
  const sampleFiles: DriveItem[] = [
    {
      id: 'file-1',
      name: 'Q3_Ecosystem_Architecture.pdf',
      type: 'file',
      mimeType: 'application/pdf',
      size: 14200000,
      modifiedAt: '2026-10-01T10:00:00Z',
      isStarred: true,
    },
    {
      id: 'file-2',
      name: 'Sovereign_Keystore_Spec.docx',
      type: 'file',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 8600000,
      modifiedAt: '2026-09-28T14:30:00Z',
      isStarred: false,
    },
    {
      id: 'file-3',
      name: 'fastcdc_chunker.rs',
      type: 'file',
      mimeType: 'text/x-rust',
      size: 5200000,
      modifiedAt: '2026-09-29T11:15:00Z',
      isStarred: true,
    },
    {
      id: 'file-4',
      name: 'ledger_backup_cas.tar.gz',
      type: 'file',
      mimeType: 'application/gzip',
      size: 24000000,
      modifiedAt: '2026-09-30T16:45:00Z',
      isStarred: false,
    },
  ];

  const sampleFolders: DriveItem[] = [
    {
      id: 'folder-1',
      name: 'Cryptographic_Keys',
      type: 'folder',
      mimeType: '',
      size: 0,
      modifiedAt: '2026-09-20T08:00:00Z',
    },
    {
      id: 'folder-2',
      name: 'Research_Whitepapers',
      type: 'folder',
      mimeType: '',
      size: 0,
      modifiedAt: '2026-09-25T12:00:00Z',
    },
  ];

  // Helper to ensure strictly ZERO raw Unicode emojis
  const assertZeroRawEmojis = (html: string) => {
    // Matches standard emoji unicode ranges
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  };

  // ==========================================================================
  // 1. DriveContextTabsHeader Tests
  //
  // NOTE (Wave 89): the header was redesigned from 5 tabs
  // (My Files/Shared/Vault/Starred/Cleaner) to 4 context tabs
  // (Home/Feed/AI Memory/Vault). These assertions track the new contract.
  // ==========================================================================
  describe('1. DriveContextTabsHeader Component', () => {
    it('renders all 4 context tabs', () => {
      const html = renderToStaticMarkup(
        <DriveContextTabsHeader activeTab="home" onTabChange={() => {}} />,
      );

      expect(html).toContain('drive-tab-home');
      expect(html).toContain('drive-tab-feed');
      expect(html).toContain('drive-tab-aimemory');
      expect(html).toContain('drive-tab-vault');

      expect(html).toContain('Home');
      expect(html).toContain('Feed');
      expect(html).toContain('AI Memory');
      // R3-P2 copy honesty: the vault tab must carry a provable label —
      // no "Sovereign" marketing anywhere in the header.
      expect(html).toContain('>Vault<');
      expect(html).not.toMatch(/Sovereign/i);
    });

    it('sets aria-selected="true" on active tab', () => {
      const tabs: DriveSubTab[] = ['home', 'feed', 'aimemory', 'vault'];

      tabs.forEach((activeTab) => {
        const html = renderToStaticMarkup(
          <DriveContextTabsHeader activeTab={activeTab} onTabChange={() => {}} />,
        );
        expect(html).toContain(`id="drive-tab-${activeTab}"`);
        expect(html).toMatch(
          new RegExp(`<button[^>]*id="drive-tab-${activeTab}"[^>]*aria-selected="true"|<button[^>]*aria-selected="true"[^>]*id="drive-tab-${activeTab}"`),
        );
      });
    });

    it('renders badgeText for AI Memory (AI) and no unverified E2EE badge on Vault', () => {
      const html = renderToStaticMarkup(
        <DriveContextTabsHeader activeTab="home" onTabChange={() => {}} />,
      );

      expect(html).not.toContain('E2EE');
      expect(html).not.toContain('AES-256');
      expect(html).toContain('>AI<');
    });

    it('contains strictly ZERO raw Unicode emojis in header', () => {
      const html = renderToStaticMarkup(
        <DriveContextTabsHeader activeTab="home" onTabChange={() => {}} />,
      );
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 2. DriveFilesSubView Tests
  // ==========================================================================
  describe('2. DriveFilesSubView Component', () => {
    it('renders storage quota meter from the real quota hook (not a hardcoded pair)', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} />,
      );

      expect(html).toContain('Storage Quota Meter');
      // Mocked hook value: 14.2 GB used of 100 GB total.
      expect(html).toContain('14.2 GB');
      expect(html).toContain('/ 100 GB');
      expect(html).toContain('Your current usage and available space.');
      expect(html).toContain('role="progressbar"');
      expect(html).not.toContain('Calculating');
      // R3-P1 copy honesty: no unprovable marketing claims on the quota card.
      expect(html).not.toContain('Enterprise Sovereign Cloud');
      expect(html).not.toContain('FastCDC Content-Defined Chunking');
      expect(html).not.toContain('Zero-Egress');
      expect(html).not.toContain('All objects backed by FastCDC');
    });

    it('quota sub-line carries mt-0.5 (spacing parity with SingleEnterpriseStorageGauge in DriveSubViews)', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} />,
      );

      // The "% used · … available" sub-line must have the same top margin as
      // its sibling gauge (DriveSubViews.tsx SingleEnterpriseStorageGauge),
      // which renders class "... font-medium mt-0.5" on the same sub-line.
      expect(html).toContain('14% used');
      expect(html).toContain(
        '<p class="text-[11px] text-[var(--app-accent)] font-medium mt-0.5">',
      );
    });

    it('renders all 4 color-coded type cards (PDF Red, DOC Blue, CODE Green, ZIP Gold)', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} />,
      );

      // PDF Red
      expect(html).toContain('PDF Documents');
      expect(html).toContain('RED');

      // DOC Blue
      expect(html).toContain('Documents &amp; Text');
      expect(html).toContain('BLUE');

      // CODE Green
      expect(html).toContain('Code &amp; Scripts');
      expect(html).toContain('GREEN');

      // ZIP Gold
      expect(html).toContain('Archives &amp; Data');
      expect(html).toContain('GOLD');
    });

    it('does NOT render unconditional FastCDC deduplication badges on files (R4-NEW-1)', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} />,
      );

      expect(html).not.toContain('FastCDC Deduped');
      // Unprovable per-file storage-internals claims are gone too.
      expect(html).not.toContain('CAS: 64KB');
    });

    it('does NOT render unconditional FastCDC deduplication badges in grid view (R4-NEW-1)', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} viewMode="grid" />,
      );

      expect(html).not.toContain('FastCDC Deduped');
      expect(html).not.toContain('CAS: 64KB');
    });

    it('renders folders and regular files in grid view', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} viewMode="grid" />,
      );

      expect(html).toContain('Cryptographic_Keys');
      expect(html).toContain('Research_Whitepapers');
      expect(html).toContain('Q3_Ecosystem_Architecture.pdf');
      expect(html).toContain('fastcdc_chunker.rs');
    });

    it('renders list view table when viewMode is list', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} viewMode="list" />,
      );

      expect(html).toContain('Q3_Ecosystem_Architecture.pdf');
      expect(html).toContain('fastcdc_chunker.rs');
      expect(html).toContain('Download');
    });

    it('contains strictly ZERO raw Unicode emojis in files subview', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} />,
      );
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 3. DriveSharedSubView Tests
  // ==========================================================================
  describe('3. DriveSharedSubView Component', () => {
    it('renders Shared with Me banner and active counter', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView />);
      expect(html).toContain('Shared with Me');
      expect(html).toContain('Active');
      expect(html).toContain('drive-panel-shared');
    });

    it('renders collaborator avatars with user initials from real shares', () => {
      const html = renderToStaticMarkup(
        <DriveSharedSubView
          shares={[
            {
              id: 'share-1',
              name: 'Report.pdf',
              type: 'file',
              mimeType: 'application/pdf',
              size: 1000,
              sharedDate: '2026-10-01T09:15:00Z',
              permission: 'Viewer',
              owner: { name: 'Test User', email: 'test@example.com' },
              status: 'accepted',
            },
          ]}
        />,
      );

      // Test User -> TU
      expect(html).toContain('TU');
    });

    it('shows an honest empty state when there are no shares', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView shares={[]} />);

      expect(html).toContain('No shared files yet');
      expect(html).not.toContain('Elena Rostova');
      expect(html).not.toContain('Marcus Vance');
    });

    it('renders permission chips: Viewer, Editor', () => {
      const html = renderToStaticMarkup(
        <DriveSharedSubView
          shares={[
            {
              id: 'share-1',
              name: 'A.pdf',
              type: 'file',
              mimeType: 'application/pdf',
              size: 1000,
              sharedDate: '2026-10-01T09:15:00Z',
              permission: 'Viewer',
              owner: { name: 'A B', email: 'a@example.com' },
              status: 'accepted',
            },
            {
              id: 'share-2',
              name: 'B.pdf',
              type: 'file',
              mimeType: 'application/pdf',
              size: 1000,
              sharedDate: '2026-10-01T09:15:00Z',
              permission: 'Editor',
              owner: { name: 'C D', email: 'c@example.com' },
              status: 'pending',
            },
          ]}
        />,
      );

      expect(html).toContain('Viewer');
      expect(html).toContain('Editor');
    });

    it('renders formatted shared dates and action buttons', () => {
      const html = renderToStaticMarkup(
        <DriveSharedSubView
          shares={[
            {
              id: 'share-1',
              name: 'A.pdf',
              type: 'file',
              mimeType: 'application/pdf',
              size: 1000,
              sharedDate: '2026-10-01T09:15:00Z',
              permission: 'Viewer',
              owner: { name: 'A B', email: 'a@example.com' },
              status: 'accepted',
            },
          ]}
        />,
      );

      expect(html).toContain('Shared');
      expect(html).toContain('Preview');
      expect(html).toContain('Download');
    });

    it('contains strictly ZERO raw Unicode emojis in shared subview', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView />);
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 3b. DriveSharedByMeSubView Tests (QM-M39-001 — M39 screen 5)
  // ==========================================================================
  describe('3b. DriveSharedByMeSubView Component', () => {
    const sampleItems: SentShareItem[] = [
      {
        id: 'file-1',
        name: 'Roadmap.pdf',
        type: 'file',
        mimeType: 'application/pdf',
        size: 4096,
        updatedAt: '2026-10-05T10:00:00Z',
        sharedCount: 2,
        sharedWith: [
          {
            name: 'Asha Rao',
            email: 'asha@example.com',
            permission: 'edit',
            status: 'accepted',
            sharedAt: '2026-10-06T10:00:00Z',
          },
          {
            name: 'Ben Cole',
            email: 'ben@example.com',
            permission: 'view',
            status: 'pending',
            sharedAt: '2026-10-07T10:00:00Z',
          },
        ],
        linkShare: { role: 'viewer', requiresPassword: false, expiresAt: null },
      },
      {
        id: 'folder-1',
        name: 'Design assets',
        type: 'folder',
        mimeType: '',
        size: 0,
        updatedAt: '2026-10-04T10:00:00Z',
        sharedCount: 1,
        sharedWith: [
          {
            name: 'Cara Diaz',
            email: 'cara@example.com',
            permission: 'admin',
            status: 'accepted',
            sharedAt: '2026-10-04T10:00:00Z',
          },
        ],
        linkShare: null,
      },
    ];

    it('renders the Shared by Me banner with the real item count', () => {
      const html = renderToStaticMarkup(<DriveSharedByMeSubView items={sampleItems} />);

      expect(html).toContain('Shared by Me');
      expect(html).toContain('drive-panel-shared-by-me');
      expect(html).toContain('2 Shared');
    });

    it('shows an honest empty state when the user has shared nothing', () => {
      const html = renderToStaticMarkup(<DriveSharedByMeSubView items={[]} />);

      expect(html).toContain('shared anything yet');
      expect(html).not.toContain('Roadmap.pdf');
      expect(html).not.toContain('Asha Rao');
    });

    it('renders per-item share summaries with real recipient counts', () => {
      const html = renderToStaticMarkup(<DriveSharedByMeSubView items={sampleItems} />);

      expect(html).toContain('Roadmap.pdf');
      expect(html).toContain('Design assets');
      expect(html).toContain('2 people');
      expect(html).toContain('1 person');
    });

    it('renders the link-state chip only where a link is really on', () => {
      const html = renderToStaticMarkup(<DriveSharedByMeSubView items={sampleItems} />);

      // The file has an active link; the folder has linkShare: null — so the
      // "Link on" chip must appear exactly once (no fake link states).
      expect(html.match(/Link on/g)).toHaveLength(1);
    });

    it('exposes View access only for files (permissions-viewer entry point)', () => {
      const html = renderToStaticMarkup(
        <DriveSharedByMeSubView items={sampleItems} onManageAccess={() => {}} />,
      );

      // Files open the access modal; folders (no file-share surface) get none.
      expect(html.match(/View access/g)).toHaveLength(1);
    });

    it('shows a loading skeleton instead of fake rows while loading', () => {
      const html = renderToStaticMarkup(<DriveSharedByMeSubView items={[]} loading />);

      expect(html).toContain('Loading shared items');
      expect(html).not.toContain('Roadmap.pdf');
    });

    it('renders skeleton shimmer bars on app token surfaces (not off-black hexes)', () => {
      const html = renderToStaticMarkup(<DriveSharedByMeSubView items={[]} loading />);

      // Sibling subviews (Recent) skeleton on bg-[var(--quant-surface-elevated)];
      // Shared-by-me must match the token convention, never hardcode off-black grays.
      expect(html).toContain('bg-[var(--quant-surface-elevated)]');
      expect(html).not.toContain('bg-[#1E2433]');
      expect(html).not.toContain('bg-[#1A1E2A]');
    });

    it('contains strictly ZERO raw Unicode emojis in shared-by-me subview', () => {
      const html = renderToStaticMarkup(<DriveSharedByMeSubView items={sampleItems} />);
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 4. DriveVaultSubView Tests
  // ==========================================================================
  describe('4. DriveVaultSubView Component', () => {
    it('renders an honest vault status card without unverified crypto claims', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView />);

      expect(html).toContain('drive-panel-vault');
      expect(html).not.toContain('Zero-Knowledge Encryption');
      expect(html).not.toContain('AES-256-GCM');
      expect(html).not.toContain('SubtleCrypto');
      expect(html).not.toContain('Hardware Keystore');
    });

    it('shows an honest empty state when there are no vault items', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView />);

      expect(html).toContain('No vault items yet');
      expect(html).not.toContain('financial_audit_q3_2026.pdf.enc');
      expect(html).not.toContain('sovereign_identity_credentials.dat.enc');
      expect(html).not.toContain('Decrypt on Demand');
      // The dead-end is fixed: the empty state must NOT promise a lock action
      // that does not exist — it admits the action is not available yet.
      expect(html).not.toContain('Lock a file to add it to your vault');
      expect(html).toContain('not available yet');
    });

    it('renders real vault items as plain metadata, without crypto theatre', () => {      const html = renderToStaticMarkup(
        <DriveVaultSubView
          items={[
            {
              id: 'v1',
              name: 'notes.txt.enc',
              cipherSize: 1024,
              cipherAlgorithm: 'AES-256-GCM',
              sha256Checksum: 'abc123',
              encryptedAt: '2026-10-01T00:00:00Z',
            },
          ]}
        />,
      );

      expect(html).toContain('notes.txt.enc');
      expect(html).toContain('1 KB');
      // The item's own cipher field renders verbatim as neutral metadata
      // (real data, not a UI claim); security theatre stays out.
      expect(html).toContain('AES-256-GCM');
      expect(html).not.toContain('SHA-256');
    });

    it('contains strictly ZERO raw Unicode emojis in vault subview', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView />);
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 5. DriveStarredSubView Tests
  // ==========================================================================
  describe('5. DriveStarredSubView Component', () => {
    it('renders Starred & Pinned Files banner and pinned counter', () => {
      const html = renderToStaticMarkup(<DriveStarredSubView items={[]} />);

      expect(html).toContain('Starred &amp; Pinned Files');
      expect(html).toContain('Pinned');
      expect(html).toContain('drive-panel-starred');
    });

    it('shows an honest empty state when nothing is starred', () => {
      const html = renderToStaticMarkup(<DriveStarredSubView items={[]} />);

      expect(html).toContain('No starred files yet');
      expect(html).not.toContain('Sovereign_Cloud_Key_Management_RFC.pdf');
      expect(html).not.toContain('Q3_Financial_Projections_Final.xlsx');
    });

    it('renders real starred items when provided', () => {
      const html = renderToStaticMarkup(
        <DriveStarredSubView
          items={[
            {
              id: 's1',
              name: 'MyDoc.pdf',
              type: 'file',
              mimeType: 'application/pdf',
              size: 1000,
              modifiedAt: '2026-10-01T00:00:00Z',
              isStarred: true,
            },
          ]}
        />,
      );

      expect(html).toContain('MyDoc.pdf');
      expect(html).toContain('Download');
      expect(html).toContain('Delete');
    });

    it('contains strictly ZERO raw Unicode emojis in starred subview', () => {
      const html = renderToStaticMarkup(<DriveStarredSubView items={[]} />);
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 6. DriveCleanerSubView Tests
  // ==========================================================================
  describe('6. DriveCleanerSubView Component', () => {
    it('renders Storage Cleaner header with honest copy', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);

      expect(html).toContain('Storage Cleaner');
      expect(html).toContain('drive-panel-cleaner');
      expect(html).not.toContain('94.2% Bandwidth Saved');
      expect(html).not.toContain('4.8 GB');
    });

    it('shows an honest empty state when no duplicates are found', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);

      expect(html).toContain('No duplicates found');
      expect(html).not.toContain('Quarterly_Report_v1.pdf');
      expect(html).not.toContain('Reclaim 4.8 GB Storage');
    });

    it('renders real duplicate clusters when provided', () => {
      const html = renderToStaticMarkup(
        <DriveCleanerSubView
          clusters={[
            {
              clusterId: 'c1',
              title: 'a.pdf vs b.pdf',
              similarity: '98% match',
              potentialSavings: '1 MB',
              files: [
                {
                  id: 'f1',
                  name: 'a.pdf',
                  path: '/a.pdf',
                  size: '1 MB',
                  modified: 'Oct 1, 2026',
                  isOriginal: true,
                },
              ],
            },
          ]}
        />,
      );

      expect(html).toContain('a.pdf vs b.pdf');
      expect(html).toContain('Reclaimable: 1 MB');
    });

    it('contains strictly ZERO raw Unicode emojis in cleaner subview', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);
      assertZeroRawEmojis(html);
    });
  });
});
