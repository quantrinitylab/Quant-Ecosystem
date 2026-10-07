import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveHomeSubView,
  DriveFeedSubView,
  DriveAiMemorySubView,
  SingleEnterpriseStorageGauge,
  type DriveItem,
} from '../components/DriveSubViews';

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

describe('QuantDrive Categories, Feed & AI Memory Suite', () => {
  const sampleFiles: DriveItem[] = [
    {
      id: 'file-1',
      name: 'System_Diagram.png',
      type: 'file',
      mimeType: 'image/png',
      size: 4200000,
      modifiedAt: '2026-10-06T10:00:00Z',
    },
    {
      id: 'file-2',
      name: 'Keynote_Demo.mp4',
      type: 'file',
      mimeType: 'video/mp4',
      size: 140000000,
      modifiedAt: '2026-10-06T11:00:00Z',
    },
    {
      id: 'file-3',
      name: 'Sovereign_Spec.pdf',
      type: 'file',
      mimeType: 'application/pdf',
      size: 8500000,
      modifiedAt: '2026-10-05T09:00:00Z',
    },
  ];

  const sampleFolders: DriveItem[] = [
    {
      id: 'folder-1',
      name: 'Architecture_2026',
      type: 'folder',
      mimeType: '',
      size: 0,
      modifiedAt: '2026-10-01T08:00:00Z',
    },
  ];

  // Helper to ensure strictly ZERO raw Unicode emojis
  const assertZeroRawEmojis = (html: string) => {
    const emojiRegex =
      /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  };

  // ==========================================================================
  // 1. Single Enterprise Storage Gauge Tests
  // ==========================================================================
  describe('1. SingleEnterpriseStorageGauge', () => {
    it('renders exactly one enterprise storage gauge with total used, plan name, and remaining capacity', () => {
      const html = renderToStaticMarkup(
        <SingleEnterpriseStorageGauge
          usedFormatted="14.2 GB"
          totalFormatted="100 GB"
          planName="Sovereign Enterprise Plan"
          remainingFormatted="85.8 GB remaining"
          usedBytes={14.2 * 1024 ** 3}
          totalBytes={100 * 1024 ** 3}
        />,
      );

      expect(html).toContain('data-testid="single-enterprise-storage-gauge"');
      expect(html).toContain('14.2 GB');
      expect(html).toContain('/ 100 GB');
      expect(html).toContain('Sovereign Enterprise Plan');
      expect(html).toContain('85.8 GB remaining');
      expect(html).toContain('Upgrade Plan');
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('FastCDC 64KB CAS · Zero-Egress Storage');
    });

    it('shows Calculating… instead of invented numbers when quota is unknown', () => {
      const html = renderToStaticMarkup(<SingleEnterpriseStorageGauge />);
      // Default props must never be fabricated stats like the old "128.4 GB / 2 TB".
      expect(html).not.toContain('128.4 GB');
      expect(html).not.toContain('2 TB');
      expect(html).toContain('Calculating…');
    });

    it('contains strictly ZERO raw Unicode emojis in single enterprise storage gauge', () => {
      const html = renderToStaticMarkup(<SingleEnterpriseStorageGauge />);
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 2. DriveHomeSubView with 8 Categories & Dedicated View
  // ==========================================================================
  describe('2. DriveHomeSubView with 8 Categories', () => {
    it('renders all 8 category cards with live counts', () => {
      const html = renderToStaticMarkup(
        <DriveHomeSubView files={sampleFiles} folders={sampleFolders} />,
      );

      // Verify all 8 Category Cards
      expect(html).toContain('data-testid="category-card-images"');
      expect(html).toContain('data-testid="category-card-videos"');
      expect(html).toContain('data-testid="category-card-audios"');
      expect(html).toContain('data-testid="category-card-documents"');
      expect(html).toContain('data-testid="category-card-archive"');
      expect(html).toContain('data-testid="category-card-tags"');
      expect(html).toContain('data-testid="category-card-others"');
      expect(html).toContain('data-testid="category-card-trash"');

      // Verify Labels
      expect(html).toContain('Images');
      expect(html).toContain('Videos');
      expect(html).toContain('Audios');
      expect(html).toContain('Documents');
      expect(html).toContain('Archive');
      expect(html).toContain('Tags');
      expect(html).toContain('Others');
      expect(html).toContain('Trash');

      // Verify counts reflect REAL files only — no fabricated base seeds.
      // sampleFiles: 1 image (png), 1 video (mp4), 1 document (pdf)
      expect(html).toContain('data-testid="category-card-images"');
      // Images count should be 1 (not 1,421 from the old hardcoded 1420 seed)
      expect(html).not.toContain('1,421');
      // Videos count should be 1 (not 343 from the old hardcoded 342 seed)
      expect(html).not.toContain('343');
      // Documents count should be 1 (not 893 from the old hardcoded 892 seed)
      expect(html).not.toContain('893');
      // Trash should be 0 (not 14 from the old fallback) when trashItems is empty
      // (the "14" fallback was a fabricated number)
    });

    it('renders single enterprise storage gauge at the bottom of the Home view', () => {
      const html = renderToStaticMarkup(
        <DriveHomeSubView files={sampleFiles} folders={sampleFolders} />,
      );

      expect(html).toContain('data-testid="single-enterprise-storage-gauge"');
      // Uses the mocked quota (14.2 GB / 100 GB), never the old hardcoded 128.4 GB / 2 TB
      expect(html).toContain('14.2 GB');
      expect(html).toContain('100 GB');
      expect(html).not.toContain('128.4 GB');
      expect(html).not.toContain('2 TB');
      expect(html).toContain('Sovereign Enterprise Plan');
    });

    it('renders folders and recent items in Home view', () => {
      const html = renderToStaticMarkup(
        <DriveHomeSubView files={sampleFiles} folders={sampleFolders} />,
      );

      expect(html).toContain('Architecture_2026');
      expect(html).toContain('System_Diagram.png');
      expect(html).toContain('Keynote_Demo.mp4');
      expect(html).toContain('Sovereign_Spec.pdf');
    });

    it('contains strictly ZERO raw Unicode emojis in DriveHomeSubView', () => {
      const html = renderToStaticMarkup(
        <DriveHomeSubView files={sampleFiles} folders={sampleFolders} />,
      );
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 3. DriveFeedSubView (Visual Media Feed)
  // ==========================================================================
  describe('3. DriveFeedSubView (Visual Media Feed)', () => {
    it('renders visual media feed header and filter pills', () => {
      const html = renderToStaticMarkup(<DriveFeedSubView />);

      expect(html).toContain('Visual Media Feed');
    });

    it('renders media filter pills: All Media, Images, Videos, Audios', () => {
      const html = renderToStaticMarkup(<DriveFeedSubView />);

      expect(html).toContain('All Media');
      expect(html).toContain('Images');
      expect(html).toContain('Videos');
      expect(html).toContain('Audios');
    });

    it('shows empty state (not fake sample files) when no real files are provided', () => {
      const html = renderToStaticMarkup(<DriveFeedSubView />);
      // The old hardcoded sample files (Ecosystem_Architecture_Q3_HighRes.png etc.)
      // were fake data that didn't exist in the DB, causing downloads to 404.
      expect(html).not.toContain('Ecosystem_Architecture_Q3_HighRes.png');
      expect(html).not.toContain('QuantMeet_Keynote_Recording_4K.mp4');
      expect(html).not.toContain('Voice_Note_Sprint_Review.flac');
    });

    it('renders real media files when provided via the files prop', () => {
      const html = renderToStaticMarkup(
        <DriveFeedSubView
          files={[
            {
              id: 'real-1',
              name: 'Real_Photo.png',
              mimeType: 'image/png',
              size: 1000000,
              modifiedAt: '2026-10-06T10:00:00Z',
            },
          ]}
        />,
      );
      expect(html).toContain('Real_Photo.png');
    });

    it('contains strictly ZERO raw Unicode emojis in DriveFeedSubView', () => {
      const html = renderToStaticMarkup(<DriveFeedSubView />);
      assertZeroRawEmojis(html);
    });
  });

  // ==========================================================================
  // 4. DriveAiMemorySubView (Cross-App Relational Memory Index)
  // ==========================================================================
  describe('4. DriveAiMemorySubView (Governed Memory Index)', () => {
    it('renders an honest empty state when no memory projection is supplied', () => {
      const html = renderToStaticMarkup(<DriveAiMemorySubView />);

      expect(html).toContain('AI Memory Vault');
      expect(html).toContain('L3 Cross-App Relational');
      expect(html).toContain('Waiting for memory data');
      expect(html).toContain('Memory records will appear here after an authorized source produces a governed memory projection.');
      expect(html).not.toContain('Production Deployment Architecture Discussion');
      expect(html).not.toContain('Deep Memory Synthesis');
      expect(html).not.toContain('Creator Studio');
    });

    it('renders only supplied governed memory records and provenance metadata', () => {
      const html = renderToStaticMarkup(
        <DriveAiMemorySubView
          memories={[
            {
              id: 'memory-1',
              app: 'QuantGit',
              title: 'Preferred repository workflow',
              timestamp: '2026-10-07 10:00',
              rawContext: 'Use protected branches for production changes.',
              extractedFacts: ['Protected branches are preferred for production changes.'],
              entityGraphLinks: ['repo:quant-ecosystem'],
              confidenceScore: 94,
              sensitivity: 'normal',
              explicitness: 'confirmed',
              policyVersion: 'memory-v2',
              provenance: 'QuantGit repository settings',
            },
          ]}
          onRecallInChat={() => undefined}
          onForgetMemory={() => undefined}
        />,
      );

      expect(html).toContain('Preferred repository workflow');
      expect(html).toContain('94% Confidence');
      expect(html).toContain('Protected branches are preferred for production changes.');
      expect(html).toContain('repo:quant-ecosystem');
      expect(html).toContain('Sensitivity: normal');
      expect(html).toContain('Explicitness: confirmed');
      expect(html).toContain('Policy: memory-v2');
      expect(html).toContain('Source: QuantGit repository settings');
      expect(html).toContain('Recall Context');
      expect(html).toContain('Forget');
      expect(html).not.toContain('Production Deployment Architecture Discussion');
      expect(html).not.toContain('ElenaRostova');
    });

    it('does not invent confidence, facts, or graph links when metadata is absent', () => {
      const html = renderToStaticMarkup(
        <DriveAiMemorySubView
          memories={[
            {
              id: 'memory-2',
              app: 'Shared',
              title: 'Observed context',
              timestamp: '2026-10-07 11:00',
              rawContext: 'Observed context without a scored confidence record.',
              extractedFacts: [],
              entityGraphLinks: [],
            },
          ]}
        />,
      );

      expect(html).toContain('Confidence not scored');
      expect(html).not.toContain('Extracted Key Facts');
      expect(html).not.toContain('Sensitivity:');
      expect(html).not.toContain('repo:');
    });

    it('contains strictly ZERO raw Unicode emojis in DriveAiMemorySubView', () => {
      const html = renderToStaticMarkup(<DriveAiMemorySubView />);
      assertZeroRawEmojis(html);
    });
  });
});
