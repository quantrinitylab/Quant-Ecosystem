// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  OUTLOOK_COLOR_CATEGORIES,
  getOutlookCategory,
  OutlookCategoryPill,
  OutlookColorCategoryPicker,
} from '../components/CategoryPicker';
import { THREAD_OVERFLOW_ITEMS } from '../lib/thread-overflow';
import { matchesFocusedRule } from '../lib/inbox-focused';
import { deriveFilterPills, removeFilterPill } from '../lib/filter-pill';
import { apiClient } from '../services/api-client';
import { DockedComposer } from '../components/DockedComposer';

// Mock dependencies for DockedComposer static render
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@quant/shared-ui', () => ({
  nextRovingIndex: () => 0,
  rovingTabIndex: () => 0,
}));
vi.mock('../components/Quanty', () => ({ Quanty: () => null }));
vi.mock('../lib/quanty/reactions', () => ({
  quantyReact: vi.fn(),
  useQuantyMood: () => 'neutral',
}));
vi.mock('../components/InboxToast', () => ({ showToast: vi.fn() }));
vi.mock('../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  htmlToPlainText: (html: string) => html,
}));
vi.mock('../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));
vi.mock('../lib/safe-html', () => ({ useSafeEmailHtml: (html: string) => html }));
vi.mock('../providers/auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../hooks/useDeferredMount', () => ({ useDeferredMount: () => false }));
vi.mock('../components/useDraftAutosave', () => ({
  useDraftAutosave: () => ({}),
  draftSaveStateLabel: () => '',
}));
vi.mock('../components/RecipientChipInput', () => ({
  RecipientChipInput: () => null,
  parseEmailString: (s: string) =>
    String(s).split(/[,;\s]+/).filter(Boolean).map((email) => ({ email })),
}));
vi.mock('../hooks/useContacts', () => ({ useContacts: () => ({ data: [] }) }));
vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock('../components/UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));

describe('Outlook Parity Slices S2-S6 Client Tests', () => {
  describe('Slice S2: Outlook 6 Color Categories', () => {
    it('defines exactly the 6 Outlook colors with standard hex values', () => {
      expect(OUTLOOK_COLOR_CATEGORIES).toHaveLength(6);
      expect(OUTLOOK_COLOR_CATEGORIES.map((c) => c.name)).toEqual([
        'Red',
        'Orange',
        'Yellow',
        'Green',
        'Blue',
        'Purple',
      ]);
      expect(OUTLOOK_COLOR_CATEGORIES.find((c) => c.name === 'Red')?.color).toBe('#EF4444');
      expect(OUTLOOK_COLOR_CATEGORIES.find((c) => c.name === 'Orange')?.color).toBe('#FF6B35');
      expect(OUTLOOK_COLOR_CATEGORIES.find((c) => c.name === 'Yellow')?.color).toBe('#F59E0B');
      expect(OUTLOOK_COLOR_CATEGORIES.find((c) => c.name === 'Green')?.color).toBe('#10B981');
      expect(OUTLOOK_COLOR_CATEGORIES.find((c) => c.name === 'Blue')?.color).toBe('#38BDF8');
      expect(OUTLOOK_COLOR_CATEGORIES.find((c) => c.name === 'Purple')?.color).toBe('#8B5CF6');
    });

    it('getOutlookCategory normalizes names and "category" suffixes', () => {
      expect(getOutlookCategory('red')?.color).toBe('#EF4444');
      expect(getOutlookCategory('Red category')?.color).toBe('#EF4444');
      expect(getOutlookCategory('Blue')?.color).toBe('#38BDF8');
      expect(getOutlookCategory('purple category')?.color).toBe('#8B5CF6');
      expect(getOutlookCategory('unknown')).toBeUndefined();
    });

    it('renders OutlookCategoryPill with correct style and testid', () => {
      const html = renderToStaticMarkup(<OutlookCategoryPill category="Red" />);
      expect(html).toContain('data-testid="category-pill-red"');
      expect(html).toContain('Red');
      expect(html).toContain('#EF4444');
    });

    it('renders OutlookColorCategoryPicker with all 6 options and checkmarks', () => {
      const html = renderToStaticMarkup(
        <OutlookColorCategoryPicker
          selectedCategories={['Red', 'Blue']}
          onToggleCategory={vi.fn()}
        />,
      );
      expect(html).toContain('Red');
      expect(html).toContain('Orange');
      expect(html).toContain('Yellow');
      expect(html).toContain('Green');
      expect(html).toContain('Blue');
      expect(html).toContain('Purple');
      expect(html).toContain('aria-checked="true"');
    });
  });

  describe('Slice S3: Safety & Trust (Block, Report Junk, Report Phishing)', () => {
    it('marks block, report-junk, and report-phishing as wired in thread overflow', () => {
      const block = THREAD_OVERFLOW_ITEMS.find((item) => item.id === 'block');
      const junk = THREAD_OVERFLOW_ITEMS.find((item) => item.id === 'report-junk');
      const phish = THREAD_OVERFLOW_ITEMS.find((item) => item.id === 'report-phishing');

      expect(block?.kind).toBe('wired');
      expect(junk?.kind).toBe('wired');
      expect(phish?.kind).toBe('wired');
    });

    it('apiClient provides blockSender, reportJunk, and reportPhishing methods', () => {
      expect(typeof apiClient.blockSender).toBe('function');
      expect(typeof apiClient.reportJunk).toBe('function');
      expect(typeof apiClient.reportPhishing).toBe('function');
    });
  });

  describe('Slice S4: Focused / Other Server Override & Client Reconciler', () => {
    it('marks move-to-other as wired in thread overflow', () => {
      const moveToOther = THREAD_OVERFLOW_ITEMS.find((item) => item.id === 'move-to-other');
      expect(moveToOther?.kind).toBe('wired');
    });

    it('apiClient provides setThreadFocused method', () => {
      expect(typeof apiClient.setThreadFocused).toBe('function');
    });

    it('matchesFocusedRule honors isFocusedOverride and override labels', () => {
      expect(matchesFocusedRule({ category: 'promotions', isFocusedOverride: true })).toBe(true);
      expect(matchesFocusedRule({ category: 'primary', isFocusedOverride: false })).toBe(false);
      expect(matchesFocusedRule({ category: 'updates', labels: ['__focused_override__'] })).toBe(true);
      expect(matchesFocusedRule({ category: 'primary', labels: ['__other_override__'] })).toBe(false);
    });
  });

  describe('Slice S5: Composer Importance (HIGH / NORMAL / LOW)', () => {
    it('renders High Importance and Low Importance toggle buttons in DockedComposer toolbar', () => {
      const html = renderToStaticMarkup(
        <DockedComposer
          isOpen={true}
          onClose={vi.fn()}
          initialPriority="HIGH"
        />,
      );
      expect(html).toContain('data-testid="docked-composer-high-importance-toggle"');
      expect(html).toContain('data-testid="docked-composer-low-importance-toggle"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('High importance: ON');
    });
  });

  describe('Slice S6: Outlook Search Filter Tokens in Filter Pills', () => {
    it('supports unread, flagged, starred, attachment, to_me in canonical order', () => {
      const pills = deriveFilterPills('any', [
        'to_me',
        'attachment',
        'flagged',
        'unread',
        'starred',
      ]);
      expect(pills.map((p) => p.label)).toEqual([
        'Unread',
        'Flagged',
        'Pinned',
        'Has attachment',
        'To me',
      ]);
    });

    it('removeFilterPill removes token without mutating set', () => {
      const initial = new Set(['unread', 'attachment'] as const);
      const res = removeFilterPill('any', initial, {
        kind: 'filter',
        key: 'filter:unread',
        label: 'Unread',
      });
      expect(res.filters).toEqual(new Set(['attachment']));
      expect(initial.has('unread')).toBe(true);
    });
  });
});
