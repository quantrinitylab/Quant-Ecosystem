import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FileAISummaryDrawer,
  AISummaryManager,
  type AISummaryResult,
  type AISummaryState,
} from '../components/drive/FileAISummaryDrawer';

describe('QuantDrive File AI Insights & Entity Extraction Test Suite', () => {
  const sampleFile = {
    id: 'file-doc-123',
    name: 'Quarterly_Report_Q3.pdf',
    mimeType: 'application/pdf',
    size: 2048576, // 2 MB
  };

  const sampleInvoiceFile = {
    id: 'file-inv-456',
    name: 'Invoice_AWS_Cloud_2026.pdf',
    mimeType: 'application/pdf',
    size: 512000,
  };

  const sampleReceiptFile = {
    id: 'file-rec-789',
    name: 'Restaurant_Receipt_Sep.txt',
    mimeType: 'text/plain',
    size: 1024,
  };

  const mockSummaryApiPayload = {
    summary:
      'Q3 net revenue exceeded forecasts by 18%, driven by Cloudflare R2 and EKS optimization.',
    keyPoints: [
      'Net revenue reached $1,450,000 with 35% margin',
      'Zero security incidents reported across 20 pods',
      'Finance team must review tax filings before 2026-10-15',
    ],
    fileType: 'PDF document',
    wordCount: 150,
  };

  const mockInvoiceApiPayload = {
    invoiceNumber: 'INV-2026-0901',
    vendor: 'Amazon Web Services',
    dueDate: '2026-10-10',
    lineItems: [
      { description: 'EC2 Systrap Managed Nodes', quantity: 3, unitPrice: 120, total: 360 },
    ],
    subtotal: 360,
    tax: 0,
    total: 360,
    currency: '$',
  };

  const mockReceiptApiPayload = {
    vendor: 'Blue Tokai Coffee',
    date: '2026-09-24',
    total: 450,
    currency: '₹',
    items: [{ description: 'Pour-Over Dark Roast', amount: 450 }],
    taxAmount: 22.5,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ==========================================================================
  // 1. Headless AISummaryManager State & Logic Contracts
  // ==========================================================================
  describe('AISummaryManager Headless Engine', () => {
    it('initializes with default idle state and active summary tab', () => {
      const manager = new AISummaryManager();
      const state = manager.getState();

      expect(state.status).toBe('idle');
      expect(state.activeTab).toBe('summary');
      expect(state.data).toBeNull();
      expect(state.error).toBeNull();
      expect(state.copied).toBe(false);
      expect(state.file).toBeNull();
      expect(state.isExtractingEntities).toBe(false);
    });

    it('transitions tab state via setActiveTab', () => {
      const manager = new AISummaryManager();
      expect(manager.getState().activeTab).toBe('summary');

      manager.setActiveTab('entities');
      expect(manager.getState().activeTab).toBe('entities');

      manager.setActiveTab('actions');
      expect(manager.getState().activeTab).toBe('actions');

      manager.setActiveTab('summary');
      expect(manager.getState().activeTab).toBe('summary');
    });

    it('notifies subscribers on state transitions and supports unsubscription', () => {
      const manager = new AISummaryManager();
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.setActiveTab('entities');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ activeTab: 'entities' }));

      unsubscribe();
      manager.setActiveTab('actions');
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    it('returns error if generateSummary is called without any file', async () => {
      const manager = new AISummaryManager();
      const result = await manager.generateSummary();

      expect(result).toBeNull();
      const state = manager.getState();
      expect(state.status).toBe('error');
      expect(state.error).toContain('No file provided');
    });

    it('successfully generates summary and parses key points, tokens, and actions', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSummaryApiPayload,
      });

      const manager = new AISummaryManager({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const promise = manager.generateSummary(sampleFile);
      // Immediately verify loading state
      expect(manager.getState().status).toBe('loading');
      expect(manager.getState().file?.id).toBe(sampleFile.id);

      const result = await promise;
      expect(result).not.toBeNull();
      expect(result?.summary).toBe(mockSummaryApiPayload.summary);
      expect(result?.keyPoints).toEqual(mockSummaryApiPayload.keyPoints);
      expect(result?.tokenCount).toBe(200); // 150 * 1.33 = 200

      // Verified extracted action items
      expect(result?.actionItems).toContain(
        'Finance team must review tax filings before 2026-10-15',
      );

      // Verified state
      const state = manager.getState();
      expect(state.status).toBe('success');
      expect(state.data).toEqual(result);
      expect(state.error).toBeNull();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/drive/ai/summarize',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ fileId: sampleFile.id }),
        }),
      );
    });

    it('performs deep invoice entity extraction when file is an invoice', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/summarize')) {
          return {
            ok: true,
            json: async () => ({
              summary: 'Invoice for AWS Cloud services totaling $360.',
              keyPoints: ['AWS invoice received for EC2 instances', 'Payment due Oct 10'],
              wordCount: 50,
            }),
          };
        }
        if (url.includes('/extract-invoice')) {
          return {
            ok: true,
            json: async () => mockInvoiceApiPayload,
          };
        }
        return { ok: false, status: 404 };
      });

      const manager = new AISummaryManager({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await manager.generateSummary(sampleInvoiceFile);
      expect(result).not.toBeNull();

      // Deep extraction should populate entities
      expect(result?.entities?.vendors).toContain('Amazon Web Services');
      expect(result?.entities?.dates).toContain('Due: 2026-10-10');
      expect(result?.entities?.amounts).toContain('$360');
      expect(result?.entities?.contacts).toContain('Invoice #INV-2026-0901');
      expect(result?.actionItems).toContain('Verify invoice #INV-2026-0901 line items');
    });

    it('performs deep receipt entity extraction when file is a receipt', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/summarize')) {
          return {
            ok: true,
            json: async () => ({
              summary: 'Coffee meeting expense receipt for Blue Tokai Coffee.',
              keyPoints: ['Coffee and snacks during team sync'],
              wordCount: 30,
            }),
          };
        }
        if (url.includes('/extract-receipt')) {
          return {
            ok: true,
            json: async () => mockReceiptApiPayload,
          };
        }
        return { ok: false, status: 404 };
      });

      const manager = new AISummaryManager({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await manager.generateSummary(sampleReceiptFile);
      expect(result).not.toBeNull();
      expect(result?.entities?.vendors).toContain('Blue Tokai Coffee');
      expect(result?.entities?.dates).toContain('2026-09-24');
      expect(result?.entities?.amounts).toContain('₹450');
    });

    it('handles API failure gracefully and updates error state', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Model inference timeout in Quanty service' }),
      });

      const manager = new AISummaryManager({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await manager.generateSummary(sampleFile);
      expect(result).toBeNull();

      const state = manager.getState();
      expect(state.status).toBe('error');
      expect(state.error).toContain('Model inference timeout');
    });

    it('copies formatted summary to clipboard with temporary visual feedback', async () => {
      const clipboardSpy = vi.fn().mockResolvedValue(undefined);
      const manager = new AISummaryManager({
        clipboardFn: clipboardSpy,
        initialData: {
          summary: 'High-level executive briefing.',
          keyPoints: ['Point Alpha', 'Point Beta'],
          actionItems: ['Submit paperwork'],
          entities: {
            vendors: ['Acme Corp'],
            dates: ['2026-10-01'],
            amounts: ['$50,000'],
          },
        },
        initialFile: sampleFile,
      });

      const success = await manager.copyToClipboard();
      expect(success).toBe(true);
      expect(clipboardSpy).toHaveBeenCalledTimes(1);

      const copiedText = clipboardSpy.mock.calls[0][0];
      expect(copiedText).toContain('=== AI Summary: Quarterly_Report_Q3.pdf ===');
      expect(copiedText).toContain('High-level executive briefing.');
      expect(copiedText).toContain('• Point Alpha');
      expect(copiedText).toContain('[ ] Submit paperwork');
      expect(copiedText).toContain('• Vendors: Acme Corp');

      expect(manager.getState().copied).toBe(true);

      // Fast-forward 2000ms -> copied state should revert to false
      vi.advanceTimersByTime(2000);
      expect(manager.getState().copied).toBe(false);
    });

    it('resets state cleanly on reset() and setFile()', () => {
      const manager = new AISummaryManager({
        initialData: {
          summary: 'Existing data',
          keyPoints: [],
        },
        initialFile: sampleFile,
        initialStatus: 'success',
      });

      expect(manager.getState().status).toBe('success');
      manager.reset();

      const resetState = manager.getState();
      expect(resetState.status).toBe('idle');
      expect(resetState.data).toBeNull();
      expect(resetState.file).toBeNull();
      expect(resetState.error).toBeNull();

      manager.setFile(sampleFile);
      expect(manager.getState().file?.id).toBe(sampleFile.id);
    });
  });

  // ==========================================================================
  // 2. FileAISummaryDrawer Static HTML Rendering Contracts
  // ==========================================================================
  describe('FileAISummaryDrawer Presentation Contracts', () => {
    it('renders null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <FileAISummaryDrawer isOpen={false} file={sampleFile} onClose={vi.fn()} />,
      );
      expect(html).toBe('');
    });

    it('renders drawer shell, accessibility roles, and backdrop when open', () => {
      const html = renderToStaticMarkup(
        <FileAISummaryDrawer
          isOpen={true}
          file={sampleFile}
          onClose={vi.fn()}
          autoFetch={false}
          initialStatus="idle"
        />,
      );

      // Drawer accessibility & structure
      expect(html).toContain('data-testid="file-ai-summary-drawer"');
      expect(html).toContain('role="complementary"');
      expect(html).toContain('aria-label="AI Insights for Quarterly_Report_Q3.pdf"');
      expect(html).toContain('data-testid="drawer-backdrop"');
      expect(html).toContain('data-testid="drawer-close-btn"');
      expect(html).toContain('data-testid="copy-summary-btn"');

      // Quant Studio design tokens
      expect(html).toContain('bg-[#16181D]');
      expect(html).toContain('border-[#282C35]');
      expect(html).toContain('#FF8C42');

      // Idle state
      expect(html).toContain('data-testid="ai-summary-idle-card"');
      expect(html).toContain('Analyze File');
    });

    it('renders loading skeleton with subtle shimmer when status is loading', () => {
      const html = renderToStaticMarkup(
        <FileAISummaryDrawer
          isOpen={true}
          file={sampleFile}
          onClose={vi.fn()}
          autoFetch={false}
          initialStatus="loading"
        />,
      );

      expect(html).toContain('data-testid="ai-summary-loading-skeleton"');
      expect(html).toContain('animate-pulse');
    });

    it('renders error alert card and retry button when status is error', () => {
      const manager = new AISummaryManager({
        initialStatus: 'error',
        initialFile: sampleFile,
      });
      // Force set error message
      (manager as any).state.error = 'Inference service rate limit exceeded (429)';

      const html = renderToStaticMarkup(
        <FileAISummaryDrawer isOpen={true} file={sampleFile} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="ai-summary-error-card"');
      expect(html).toContain('Inference service rate limit exceeded (429)');
      expect(html).toContain('data-testid="retry-summary-btn"');
    });

    it('renders Summary tab with executive summary card, tokens badge, and key takeaways', () => {
      const testData: AISummaryResult = {
        summary: 'Executive overview of Q3 financial operations and infrastructure migrations.',
        keyPoints: [
          'EKS cluster staging rollout achieved 100% uptime',
          'FastCDC 64KB CAS storage lowered cloud egress to $0.00',
        ],
        actionItems: ['Approve final Q3 board presentation'],
        tokenCount: 420,
      };

      const html = renderToStaticMarkup(
        <FileAISummaryDrawer
          isOpen={true}
          file={sampleFile}
          onClose={vi.fn()}
          initialTab="summary"
          initialStatus="success"
          initialData={testData}
        />,
      );

      expect(html).toContain('data-testid="tab-summary-content"');
      expect(html).toContain('data-testid="summary-card"');
      expect(html).toContain('Executive overview of Q3 financial operations');
      expect(html).toContain('data-testid="token-count-badge"');
      expect(html).toContain('420 tokens');
      expect(html).toContain('data-testid="key-points-card"');
      expect(html).toContain('EKS cluster staging rollout achieved 100% uptime');
      expect(html).toContain('FastCDC 64KB CAS storage lowered cloud egress to $0.00');
    });

    it('renders Entities tab with detected vendor, date, amount, and contact pills', () => {
      const testDataWithEntities: AISummaryResult = {
        summary: 'Enterprise SaaS subscription renewal contract.',
        keyPoints: ['Annual billing cycle renewed'],
        entities: {
          vendors: ['Cloudflare, Inc.', 'AWS'],
          dates: ['2026-11-01', '2027-11-01'],
          amounts: ['$12,000.00', 'Subtotal: $10,000.00'],
          contacts: ['accounts@cloudflare.com', 'INV-88219'],
        },
      };

      const html = renderToStaticMarkup(
        <FileAISummaryDrawer
          isOpen={true}
          file={sampleFile}
          onClose={vi.fn()}
          initialTab="entities"
          initialStatus="success"
          initialData={testDataWithEntities}
        />,
      );

      expect(html).toContain('data-testid="tab-entities-content"');
      expect(html).toContain('data-testid="entity-section-vendors"');
      expect(html).toContain('Cloudflare, Inc.');
      expect(html).toContain('data-testid="entity-section-dates"');
      expect(html).toContain('2026-11-01');
      expect(html).toContain('data-testid="entity-section-amounts"');
      expect(html).toContain('$12,000.00');
      expect(html).toContain('data-testid="entity-section-contacts"');
      expect(html).toContain('accounts@cloudflare.com');
      expect(html).toContain('data-testid="deep-extract-btn"');
    });

    it('renders Actions tab with follow-up action checklist cards', () => {
      const testDataWithActions: AISummaryResult = {
        summary: 'Project deployment checklist.',
        keyPoints: ['Review required'],
        actionItems: [
          'Verify TLS 1.3 certificate expiration date',
          'Deploy latest Fastify backend container image to staging',
          'Execute Vitest regression gate for QuantDrive',
        ],
      };

      const html = renderToStaticMarkup(
        <FileAISummaryDrawer
          isOpen={true}
          file={sampleFile}
          onClose={vi.fn()}
          initialTab="actions"
          initialStatus="success"
          initialData={testDataWithActions}
        />,
      );

      expect(html).toContain('data-testid="tab-actions-content"');
      expect(html).toContain('Follow-up Action Items');
      expect(html).toContain('Verify TLS 1.3 certificate expiration date');
      expect(html).toContain('Deploy latest Fastify backend container image to staging');
      expect(html).toContain('Execute Vitest regression gate for QuantDrive');
      expect(html).toContain('data-testid="action-item-card"');
    });

    it('displays "Copied!" feedback when manager state has copied === true', () => {
      const manager = new AISummaryManager({
        initialData: { summary: 'Text', keyPoints: [] },
        initialFile: sampleFile,
        initialStatus: 'success',
      });
      (manager as any).state.copied = true;

      const html = renderToStaticMarkup(
        <FileAISummaryDrawer isOpen={true} file={sampleFile} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('Copied!');
      expect(html).toContain('text-emerald-400');
    });
  });
});
