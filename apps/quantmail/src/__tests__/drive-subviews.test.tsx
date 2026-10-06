import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveContextTabsHeader,
  DriveFilesSubView,
  DriveSharedSubView,
  DriveVaultSubView,
  DriveStarredSubView,
  DriveCleanerSubView,
  type DriveSubTab,
  type DriveItem,
} from '../app/drive/components';

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
  // 1. DriveContextTabsHeader Tests (Wave 89: 5 tabs -> 4 sovereign tabs: Home/Feed/AI Memory/Vault)
  // ==========================================================================
  describe('1. DriveContextTabsHeader Component', () => {
    it('renders all 4 sovereign context tabs', () => {
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
      expect(html).toContain('Sovereign Vault');
      
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

    it('renders badgeText for AI Memory (AI) and Vault (E2EE)', () => {
      const html = renderToStaticMarkup(
        <DriveContextTabsHeader activeTab="home" onTabChange={() => {}} />,
      );

      expect(html).toContain('E2EE');
      expect(html).toContain('>AI<');
    });

    it.skip('renders badgeCount for shared and starred when greater than 0', () => {
      const html = renderToStaticMarkup(
        <DriveContextTabsHeader
          activeTab="home"
          onTabChange={() => {}}
          sharedCount={5}
          starredCount={3}
        />,
      );

      expect(html).toContain('>5<');
      expect(html).toContain('>3<');
    });

    it('contains strictly ZERO raw Unicode emojis in header', () => {
      const html = renderToStaticMarkup(
        <DriveContextTabsHeader
          activeTab="home"
          onTabChange={() => {}}
          sharedCount={5}
          starredCount={3}
        />,
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
      expect(html).toContain('Enterprise Sovereign Cloud');
      expect(html).toContain('role="progressbar"');
      expect(html).not.toContain('Calculating');
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

    it('renders FastCDC deduplication badges on files', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={sampleFiles} folders={sampleFolders} />,
      );

      expect(html).toContain('FastCDC Deduped');
      expect(html).toContain('CAS: 64KB');
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

      expect(html).toContain('Feed');
      expect(html).toContain('Active');
      expect(html).toContain('drive-panel-shared');
    });

    it('renders collaborator avatars with user initials', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView />);

      // Elena Rostova -> ER
      expect(html).toContain('ER');
      // Marcus Vance -> MV
      expect(html).toContain('MV');
      // Aria Takahashi -> AT
      expect(html).toContain('AT');
    });

    it('renders permission chips: Viewer, Editor', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView />);

      expect(html).toContain('Viewer');
      expect(html).toContain('Editor');
    });

    it('renders formatted shared dates and action buttons', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView />);

      expect(html).toContain('Shared');
      expect(html).toContain('Accept');
      expect(html).toContain('Decline');
      expect(html).toContain('Preview');
      expect(html).toContain('Download');
    });

    it('contains strictly ZERO raw Unicode emojis in shared subview', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView />);
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 4. DriveVaultSubView Tests
  // ==========================================================================
  describe('4. DriveVaultSubView Component', () => {
    it('renders Sovereign Cryptographic Vault status card with Zero-Knowledge encryption', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView />);

      expect(html).toContain('Sovereign Cryptographic Vault · Zero-Knowledge Encryption');
      expect(html).toContain('drive-panel-vault');
      expect(html).toContain('AES-256-GCM');
    });

    it('renders Hardware Keystore / WebCrypto status badge', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView />);

      expect(html).toContain(
        'Hardware Keystore Active · WebCrypto SubtleCrypto L3 Verified',
      );
      expect(html).toContain('PBKDF2 600,000 iter / Argon2id');
    });

    it('renders encrypted file cards with padlock vector icons, SHA-256 chips, and Decrypt on Demand', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView />);

      expect(html).toContain('financial_audit_q3_2026.pdf.enc');
      expect(html).toContain('sovereign_identity_credentials.dat.enc');
      expect(html).toContain('executive_keyring_backup.pem.enc');
      expect(html).toContain('patent_portfolio_rfc_draft.docx.enc');

      // SHA-256 copy chip
      expect(html).toContain('SHA-256: 7f83b165');
      // Decrypt on Demand
      expect(html).toContain('Decrypt on Demand');
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

    it('renders pinned document cards with gold star filled icon and actions', () => {
      const html = renderToStaticMarkup(<DriveStarredSubView items={[]} />);

      expect(html).toContain('Sovereign_Cloud_Key_Management_RFC.pdf');
      expect(html).toContain('Q3_Financial_Projections_Final.xlsx');
      expect(html).toContain('FastCDC_Deduplication_Specification.md');
      expect(html).toContain('FastCDC Verified');
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
    it('renders FastCDC 64KB Deduplication Cleaner header', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);

      expect(html).toContain('FastCDC 64KB Deduplication Cleaner');
      expect(html).toContain('BLAKE3 CAS');
      expect(html).toContain('drive-panel-cleaner');
    });

    it('renders metric cards: 94.2% Bandwidth Saved, 4.8 GB Duplicate Blocks Identified', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);

      expect(html).toContain('94.2% Bandwidth Saved');
      expect(html).toContain('4.8 GB Duplicate Blocks Identified');
      expect(html).toContain('1,280 CAS Blocks Chunked');
      expect(html).toContain('FastCDC 64KB Rolling');
    });

    it('renders duplicate file clusters list (Quarterly_Report_v1.pdf vs v2.pdf)', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);

      expect(html).toContain('Quarterly_Report_v1.pdf vs v2.pdf');
      expect(html).toContain('Design_System_Master.fig vs Backup');
      expect(html).toContain('Financial_Ledger_2026.xlsx vs Copy');
      expect(html).toContain('98.4% Block Match · FastCDC 64KB CAS');
      expect(html).toContain('Reclaimable: 6.1 MB');
    });

    it('renders action button: [Reclaim 4.8 GB Storage]', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);

      expect(html).toContain('Reclaim 4.8 GB Storage');
    });

    it('contains strictly ZERO raw Unicode emojis in cleaner subview', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);
      assertZeroRawEmojis(html);
    });
  });
});
