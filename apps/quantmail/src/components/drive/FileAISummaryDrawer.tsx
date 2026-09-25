'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatBytes } from '../../lib/format-bytes';

export interface AISummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems?: string[];
  entities?: {
    dates?: string[];
    amounts?: string[];
    vendors?: string[];
    contacts?: string[];
  };
  tokenCount?: number;
}

export type AISummaryTab = 'summary' | 'entities' | 'actions';
export type AISummaryStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AISummaryState {
  status: AISummaryStatus;
  activeTab: AISummaryTab;
  data: AISummaryResult | null;
  error: string | null;
  copied: boolean;
  file: { id: string; name: string; mimeType: string; size: number } | null;
  isExtractingEntities: boolean;
}

export interface AISummaryManagerOptions {
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
  clipboardFn?: (text: string) => Promise<void>;
  initialTab?: AISummaryTab;
  initialStatus?: AISummaryStatus;
  initialData?: AISummaryResult;
  initialFile?: { id: string; name: string; mimeType: string; size: number } | null;
}

/**
 * Headless Manager orchestrating the AI summary, entity extraction,
 * clipboard copying, and tab lifecycle for QuantDrive files.
 */
export class AISummaryManager {
  private state: AISummaryState;
  private listeners: Set<(state?: AISummaryState) => void> = new Set();
  private fetchFn: typeof fetch;
  private clipboardFn?: (text: string) => Promise<void>;
  private apiBaseUrl: string;
  private copiedTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options?: AISummaryManagerOptions) {
    this.apiBaseUrl = options?.apiBaseUrl || '';
    this.fetchFn =
      options?.fetchFn ||
      (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as any));
    this.clipboardFn = options?.clipboardFn;

    this.state = {
      status: options?.initialStatus ?? (options?.initialData ? 'success' : 'idle'),
      activeTab: options?.initialTab ?? 'summary',
      data: options?.initialData ?? null,
      error: null,
      copied: false,
      file: options?.initialFile ?? null,
      isExtractingEntities: false,
    };
  }

  public getState = (): AISummaryState => {
    return this.state;
  };

  public subscribe = (listener: (state?: AISummaryState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch {
        // Silently ignore listener errors
      }
    });
  }

  private setState(patch: Partial<AISummaryState>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  public setActiveTab = (tab: AISummaryTab): void => {
    this.setState({ activeTab: tab });
  };

  public setFile = (
    file: { id: string; name: string; mimeType: string; size: number } | null,
  ): void => {
    if (this.state.file?.id === file?.id) return;
    this.setState({
      file,
      status: 'idle',
      data: null,
      error: null,
      copied: false,
      isExtractingEntities: false,
    });
  };

  /**
   * Generates executive summary and key takeaways by posting to /api/drive/ai/summarize.
   * If the file is identified as a receipt or invoice, also coordinates deep entity extraction.
   */
  public generateSummary = async (
    targetFile?: { id: string; name: string; mimeType: string; size: number } | null,
  ): Promise<AISummaryResult | null> => {
    const currentFile = targetFile || this.state.file;
    if (!currentFile) {
      this.setState({
        status: 'error',
        error: 'No file provided for summary generation',
      });
      return null;
    }

    this.setState({
      status: 'loading',
      error: null,
      copied: false,
      file: currentFile,
    });

    try {
      const res = await this.fetchFn(`${this.apiBaseUrl}/api/drive/ai/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: currentFile.id }),
      });

      if (!res.ok) {
        let errMsg = `Summarize failed with status ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson && (errJson.message || errJson.error)) {
            errMsg = errJson.message || errJson.error;
          }
        } catch {
          // ignore json parse error
        }
        throw new Error(errMsg);
      }

      const json = await res.json();

      const summary = json.summary || '';
      const keyPoints: string[] = Array.isArray(json.keyPoints) ? json.keyPoints : [];
      const tokenCount: number | undefined =
        typeof json.tokenCount === 'number'
          ? json.tokenCount
          : typeof json.wordCount === 'number'
            ? Math.round(json.wordCount * 1.33)
            : undefined;

      // Extract heuristic action items from key points & summary
      const actionItems: string[] = [];
      keyPoints.forEach((point) => {
        if (
          /(must|should|need to|verify|review|approve|pay|submit|update|action|follow up|todo|ensure|schedule|deadline)/i.test(
            point,
          )
        ) {
          actionItems.push(point);
        }
      });
      if (Array.isArray(json.actionItems)) {
        actionItems.push(...json.actionItems);
      }

      // Base heuristic entity extraction from summary text
      const entities: NonNullable<AISummaryResult['entities']> = {
        dates: [],
        amounts: [],
        vendors: [],
        contacts: [],
      };

      const dateMatches = summary.match(
        /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/gi,
      );
      if (dateMatches) {
        entities.dates = Array.from(new Set(dateMatches));
      }

      const amountMatches = summary.match(/(?:\$|€|£|₹|USD|EUR|GBP|INR)\s?[\d,]+(?:\.\d{2})?/gi);
      if (amountMatches) {
        entities.amounts = Array.from(new Set(amountMatches));
      }

      const result: AISummaryResult = {
        summary,
        keyPoints,
        actionItems:
          actionItems.length > 0
            ? Array.from(new Set(actionItems))
            : ['Review document findings with team', 'Verify relevant dates and terms'],
        entities,
        tokenCount,
      };

      // Check if file is receipt or invoice to run deep entity extraction
      const isReceipt =
        /receipt|expense|bill|slip/i.test(currentFile.name) ||
        currentFile.mimeType.toLowerCase().includes('receipt');
      const isInvoice =
        /invoice|statement|inv-/i.test(currentFile.name) ||
        currentFile.mimeType.toLowerCase().includes('invoice');

      if (isReceipt || isInvoice) {
        try {
          const deep = await this.extractEntities(currentFile, false);
          if (deep) {
            result.entities = {
              dates: Array.from(
                new Set([...(result.entities?.dates || []), ...(deep.dates || [])]),
              ),
              amounts: Array.from(
                new Set([...(result.entities?.amounts || []), ...(deep.amounts || [])]),
              ),
              vendors: Array.from(
                new Set([...(result.entities?.vendors || []), ...(deep.vendors || [])]),
              ),
              contacts: Array.from(
                new Set([...(result.entities?.contacts || []), ...(deep.contacts || [])]),
              ),
            };
            if (deep.actionItems && deep.actionItems.length > 0) {
              result.actionItems = Array.from(
                new Set([...(result.actionItems || []), ...deep.actionItems]),
              );
            }
          }
        } catch {
          // Deep entity extraction optional fallback
        }
      }

      this.setState({
        status: 'success',
        data: result,
        error: null,
      });

      return result;
    } catch (err: any) {
      const message = err?.message || 'Failed to generate AI summary';
      this.setState({
        status: 'error',
        error: message,
      });
      return null;
    }
  };

  /**
   * Deep entity extraction for documents, invoices, or receipts.
   * Calls /api/drive/ai/extract-invoice or /api/drive/ai/extract-receipt.
   */
  public extractEntities = async (
    targetFile?: { id: string; name: string; mimeType: string; size: number } | null,
    updateState: boolean = true,
  ): Promise<(NonNullable<AISummaryResult['entities']> & { actionItems?: string[] }) | null> => {
    const currentFile = targetFile || this.state.file;
    if (!currentFile) return null;

    if (updateState) {
      this.setState({ isExtractingEntities: true });
    }

    const isInvoice =
      /invoice|statement|inv-/i.test(currentFile.name) ||
      currentFile.mimeType.toLowerCase().includes('invoice');
    const endpoint = isInvoice
      ? `${this.apiBaseUrl}/api/drive/ai/extract-invoice`
      : `${this.apiBaseUrl}/api/drive/ai/extract-receipt`;

    try {
      const res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: currentFile.id }),
      });

      if (!res.ok) {
        throw new Error(`Entity extraction failed with status ${res.status}`);
      }

      const raw = await res.json();
      const dates: string[] = [];
      const amounts: string[] = [];
      const vendors: string[] = [];
      const contacts: string[] = [];
      const actionItems: string[] = [];

      if (raw.vendor) vendors.push(raw.vendor);
      if (raw.date) dates.push(raw.date);
      if (raw.dueDate) dates.push(`Due: ${raw.dueDate}`);
      if (typeof raw.total === 'number') {
        const curr = raw.currency || '$';
        amounts.push(`${curr}${raw.total}`);
      }
      if (typeof raw.subtotal === 'number') {
        const curr = raw.currency || '$';
        amounts.push(`Subtotal: ${curr}${raw.subtotal}`);
      }
      if (typeof raw.taxAmount === 'number' && raw.taxAmount > 0) {
        amounts.push(`Tax: $${raw.taxAmount}`);
      }
      if (raw.invoiceNumber) {
        contacts.push(`Invoice #${raw.invoiceNumber}`);
        actionItems.push(`Verify invoice #${raw.invoiceNumber} line items`);
      }
      if (raw.dueDate) {
        actionItems.push(`Payment due on ${raw.dueDate}`);
      }

      const extracted = { dates, amounts, vendors, contacts, actionItems };

      if (updateState && this.state.data) {
        const mergedEntities: NonNullable<AISummaryResult['entities']> = {
          dates: Array.from(new Set([...(this.state.data.entities?.dates || []), ...dates])),
          amounts: Array.from(new Set([...(this.state.data.entities?.amounts || []), ...amounts])),
          vendors: Array.from(new Set([...(this.state.data.entities?.vendors || []), ...vendors])),
          contacts: Array.from(
            new Set([...(this.state.data.entities?.contacts || []), ...contacts]),
          ),
        };
        const mergedActions = Array.from(
          new Set([...(this.state.data.actionItems || []), ...actionItems]),
        );

        this.setState({
          isExtractingEntities: false,
          data: {
            ...this.state.data,
            entities: mergedEntities,
            actionItems: mergedActions,
          },
        });
      } else if (updateState) {
        this.setState({ isExtractingEntities: false });
      }

      return extracted;
    } catch (err) {
      if (updateState) {
        this.setState({ isExtractingEntities: false });
      }
      throw err;
    }
  };

  /**
   * 1-Click copy of formatted summary to clipboard with temporary visual feedback.
   */
  public copyToClipboard = async (customText?: string): Promise<boolean> => {
    let text = customText;
    if (!text) {
      if (!this.state.data) return false;
      const lines: string[] = [
        `=== AI Summary: ${this.state.file?.name || 'Document'} ===`,
        '',
        this.state.data.summary,
        '',
        'Key Takeaways:',
        ...this.state.data.keyPoints.map((kp) => `• ${kp}`),
      ];

      if (this.state.data.actionItems && this.state.data.actionItems.length > 0) {
        lines.push('', 'Action Items:', ...this.state.data.actionItems.map((a) => `[ ] ${a}`));
      }

      if (this.state.data.entities) {
        const e = this.state.data.entities;
        const entityLines: string[] = [];
        if (e.vendors?.length) entityLines.push(`• Vendors: ${e.vendors.join(', ')}`);
        if (e.dates?.length) entityLines.push(`• Dates: ${e.dates.join(', ')}`);
        if (e.amounts?.length) entityLines.push(`• Amounts: ${e.amounts.join(', ')}`);
        if (e.contacts?.length) entityLines.push(`• Contacts: ${e.contacts.join(', ')}`);
        if (entityLines.length > 0) {
          lines.push('', 'Entities:', ...entityLines);
        }
      }

      text = lines.join('\n');
    }

    try {
      if (this.clipboardFn) {
        await this.clipboardFn(text);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      this.setState({ copied: true });

      if (this.copiedTimeout !== null) {
        clearTimeout(this.copiedTimeout);
      }
      this.copiedTimeout = setTimeout(() => {
        this.setState({ copied: false });
        this.copiedTimeout = null;
      }, 2000);

      return true;
    } catch {
      return false;
    }
  };

  public reset = (): void => {
    if (this.copiedTimeout !== null) {
      clearTimeout(this.copiedTimeout);
      this.copiedTimeout = null;
    }
    this.setState({
      status: 'idle',
      activeTab: 'summary',
      data: null,
      error: null,
      copied: false,
      file: null,
      isExtractingEntities: false,
    });
  };

  public destroy = (): void => {
    if (this.copiedTimeout !== null) {
      clearTimeout(this.copiedTimeout);
      this.copiedTimeout = null;
    }
    this.listeners.clear();
  };
}

export interface FileAISummaryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  file: { id: string; name: string; mimeType: string; size: number } | null;
  manager?: AISummaryManager;
  autoFetch?: boolean;
  initialTab?: AISummaryTab;
  initialData?: AISummaryResult;
  initialStatus?: AISummaryStatus;
  className?: string;
}

/**
 * Slide-over drawer panel presenting AI-generated executive summaries,
 * key takeaways, detected entities (dates, amounts, vendors, contacts),
 * and follow-up action items.
 */
export function FileAISummaryDrawer({
  isOpen,
  onClose,
  file,
  manager: providedManager,
  autoFetch = true,
  initialTab = 'summary',
  initialData,
  initialStatus,
  className = '',
}: FileAISummaryDrawerProps) {
  // If an external manager is passed, use it; otherwise create internal manager
  const manager = useMemo(() => {
    if (providedManager) return providedManager;
    return new AISummaryManager({
      initialTab,
      initialData,
      initialStatus,
      initialFile: file,
    });
  }, [providedManager]);

  const [state, setState] = useState<AISummaryState>(() => manager.getState());
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    return manager.subscribe((newState) => {
      if (newState) setState(newState);
    });
  }, [manager]);

  // Synchronize file changes
  useEffect(() => {
    if (file && (!state.file || state.file.id !== file.id)) {
      manager.setFile(file);
    }
  }, [file, manager, state.file]);

  // Auto-fetch summary when opened with a file if idle and no data
  useEffect(() => {
    if (
      isOpen &&
      file &&
      autoFetch &&
      manager.getState().status === 'idle' &&
      !manager.getState().data
    ) {
      manager.generateSummary(file);
    }
  }, [isOpen, file, autoFetch, manager]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleAction = useCallback((item: string) => {
    setCompletedActions((prev) => ({
      ...prev,
      [item]: !prev[item],
    }));
  }, []);

  if (!isOpen) {
    return null;
  }

  const activeTab = state.activeTab;
  const data = state.data;
  const fileName = file?.name || state.file?.name || 'Document';
  const fileSizeStr =
    file?.size || state.file?.size ? formatBytes(file?.size || state.file?.size || 0) : '';

  return (
    <>
      {/* Frosted Glass Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        data-testid="drawer-backdrop"
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <aside
        role="complementary"
        aria-label={`AI Insights for ${fileName}`}
        aria-modal="true"
        data-testid="file-ai-summary-drawer"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-[#16181D] text-slate-100 shadow-2xl border-l border-[#282C35] transition-transform duration-300 ease-in-out ${className}`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-[#282C35] px-6 py-4 bg-[#16181D]/90 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FF8C42]/20 via-[#FF8C42]/10 to-[#60A5FA]/20 border border-[#FF8C42]/30 text-[#FF8C42]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">Quant AI Insights</h2>
                <span className="inline-flex items-center rounded-full bg-[#FF8C42]/15 px-2 py-0.5 text-[10px] font-medium text-[#FF8C42] border border-[#FF8C42]/30">
                  Drive AI
                </span>
              </div>
              <p className="truncate text-xs text-slate-400 font-mono" title={fileName}>
                {fileName} {fileSizeStr && `• ${fileSizeStr}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 1-Click Copy Summary Button */}
            <button
              type="button"
              data-testid="copy-summary-btn"
              onClick={() => manager.copyToClipboard()}
              disabled={!data}
              title="Copy formatted summary to clipboard"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                state.copied
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-[#282C35] bg-[#282C35]/50 hover:bg-[#282C35] text-slate-200 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {state.copied ? (
                <>
                  <svg
                    className="w-3.5 h-3.5 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Copy Summary</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Insights"
              data-testid="drawer-close-btn"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#282C35] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 3 Tab Navigation View */}
        <div className="flex border-b border-[#282C35] bg-[#16181D] px-6">
          <button
            type="button"
            data-testid="tab-summary"
            onClick={() => manager.setActiveTab('summary')}
            className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'summary'
                ? 'border-[#FF8C42] text-[#FF8C42]'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Summary</span>
            {data?.keyPoints && data.keyPoints.length > 0 && (
              <span className="rounded-full bg-[#282C35] px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
                {data.keyPoints.length}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="tab-entities"
            onClick={() => manager.setActiveTab('entities')}
            className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'entities'
                ? 'border-[#60A5FA] text-[#60A5FA]'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span>Entities</span>
            {data?.entities && (
              <span className="rounded-full bg-[#282C35] px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
                {(data.entities.dates?.length || 0) +
                  (data.entities.amounts?.length || 0) +
                  (data.entities.vendors?.length || 0) +
                  (data.entities.contacts?.length || 0)}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="tab-actions"
            onClick={() => manager.setActiveTab('actions')}
            className={`flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'actions'
                ? 'border-[#FF8C42] text-[#FF8C42]'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            <span>Actions</span>
            {data?.actionItems && data.actionItems.length > 0 && (
              <span className="rounded-full bg-[#FF8C42]/20 px-1.5 py-0.2 text-[10px] font-mono text-[#FF8C42]">
                {data.actionItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Content Body Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Loading Skeleton */}
          {state.status === 'loading' && (
            <div data-testid="ai-summary-loading-skeleton" className="space-y-6 animate-pulse">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-[#282C35] bg-[#282C35]/30">
                <div className="h-5 w-5 rounded-full bg-[#FF8C42]/40" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-3/4 rounded bg-[#282C35]" />
                  <div className="h-2.5 w-1/2 rounded bg-[#282C35]/70" />
                </div>
              </div>

              <div className="rounded-xl border border-[#282C35] bg-[#16181D] p-5 space-y-3">
                <div className="h-4 w-1/3 rounded bg-[#282C35]" />
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-[#282C35]/80" />
                  <div className="h-3 w-5/6 rounded bg-[#282C35]/80" />
                  <div className="h-3 w-4/6 rounded bg-[#282C35]/80" />
                </div>
              </div>

              <div className="rounded-xl border border-[#282C35] bg-[#16181D] p-5 space-y-3">
                <div className="h-4 w-1/4 rounded bg-[#282C35]" />
                <div className="space-y-2.5">
                  <div className="h-3 w-11/12 rounded bg-[#282C35]/70" />
                  <div className="h-3 w-10/12 rounded bg-[#282C35]/70" />
                  <div className="h-3 w-8/12 rounded bg-[#282C35]/70" />
                </div>
              </div>
            </div>
          )}

          {/* Error Alert View */}
          {state.status === 'error' && (
            <div
              data-testid="ai-summary-error-card"
              className="rounded-xl border border-red-500/30 bg-red-950/20 p-5 text-red-200 space-y-3"
            >
              <div className="flex items-center gap-2 font-medium">
                <svg
                  className="w-5 h-5 text-red-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>AI Insights Generation Error</span>
              </div>
              <p className="text-xs text-red-300/90 leading-relaxed">
                {state.error || 'Failed to process file insights.'}
              </p>
              <button
                type="button"
                data-testid="retry-summary-btn"
                onClick={() => manager.generateSummary(file)}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-semibold text-red-100 transition-colors"
              >
                Retry Analysis
              </button>
            </div>
          )}

          {/* Idle Empty View */}
          {state.status === 'idle' && !data && (
            <div
              data-testid="ai-summary-idle-card"
              className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-[#282C35] bg-[#282C35]/10 space-y-4"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF8C42]/10 border border-[#FF8C42]/20 text-[#FF8C42]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </span>
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-slate-200">No Insights Generated Yet</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  Generate executive summaries, extract structured entities, and isolate follow-up
                  action items.
                </p>
              </div>
              <button
                type="button"
                data-testid="generate-summary-btn"
                onClick={() => manager.generateSummary(file)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF8C42] to-[#FF8C42]/80 hover:from-[#FF8C42]/90 hover:to-[#FF8C42] text-xs font-semibold text-black shadow-lg transition-transform active:scale-95"
              >
                Analyze File
              </button>
            </div>
          )}

          {/* Active Tab View: SUMMARY */}
          {activeTab === 'summary' && data && (
            <div data-testid="tab-summary-content" className="space-y-6">
              {/* Executive Summary Card */}
              <div
                data-testid="summary-card"
                className="rounded-xl border border-[#282C35] bg-[#16181D]/90 p-5 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#FF8C42]" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Executive Summary
                    </h3>
                  </div>
                  {typeof data.tokenCount === 'number' && (
                    <span
                      data-testid="token-count-badge"
                      className="rounded-full bg-[#282C35] border border-slate-700 px-2 py-0.5 text-[10px] font-mono text-slate-300"
                    >
                      {data.tokenCount} tokens
                    </span>
                  )}
                </div>
                <p data-testid="summary-text" className="text-sm leading-relaxed text-slate-200">
                  {data.summary}
                </p>
              </div>

              {/* Key Takeaways Card */}
              {data.keyPoints && data.keyPoints.length > 0 && (
                <div
                  data-testid="key-points-card"
                  className="rounded-xl border border-[#282C35] bg-[#16181D]/90 p-5 shadow-lg space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#60A5FA]" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Key Takeaways ({data.keyPoints.length})
                      </h3>
                    </div>
                  </div>
                  <ul className="space-y-2.5">
                    {data.keyPoints.map((point, idx) => (
                      <li
                        key={`kp-${idx}`}
                        data-testid="key-point-item"
                        className="flex items-start gap-3 text-xs leading-normal text-slate-300"
                      >
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF8C42]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Active Tab View: ENTITIES */}
          {activeTab === 'entities' && data && (
            <div data-testid="tab-entities-content" className="space-y-6">
              {/* Vendors & Organizations */}
              {data.entities?.vendors && data.entities.vendors.length > 0 && (
                <div
                  data-testid="entity-section-vendors"
                  className="rounded-xl border border-[#282C35] bg-[#16181D]/90 p-5 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[#FF8C42]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Vendors & Organizations
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.entities.vendors.map((vendor, idx) => (
                      <span
                        key={`ven-${idx}`}
                        data-testid="entity-pill-vendor"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#FF8C42]/30 bg-[#FF8C42]/10 px-2.5 py-1 text-xs font-medium text-[#FF8C42]"
                      >
                        🏢 {vendor}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dates & Deadlines */}
              {data.entities?.dates && data.entities.dates.length > 0 && (
                <div
                  data-testid="entity-section-dates"
                  className="rounded-xl border border-[#282C35] bg-[#16181D]/90 p-5 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[#60A5FA]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Dates & Deadlines
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.entities.dates.map((date, idx) => (
                      <span
                        key={`dt-${idx}`}
                        data-testid="entity-pill-date"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#60A5FA]/30 bg-[#60A5FA]/10 px-2.5 py-1 text-xs font-mono text-[#60A5FA]"
                      >
                        📅 {date}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Amounts & Financial Totals */}
              {data.entities?.amounts && data.entities.amounts.length > 0 && (
                <div
                  data-testid="entity-section-amounts"
                  className="rounded-xl border border-[#282C35] bg-[#16181D]/90 p-5 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Financial Amounts
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.entities.amounts.map((amount, idx) => (
                      <span
                        key={`amt-${idx}`}
                        data-testid="entity-pill-amount"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-mono font-medium text-emerald-400"
                      >
                        💵 {amount}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts & References */}
              {data.entities?.contacts && data.entities.contacts.length > 0 && (
                <div
                  data-testid="entity-section-contacts"
                  className="rounded-xl border border-[#282C35] bg-[#16181D]/90 p-5 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-purple-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Contacts & Identifiers
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.entities.contacts.map((contact, idx) => (
                      <span
                        key={`ct-${idx}`}
                        data-testid="entity-pill-contact"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-300"
                      >
                        👤 {contact}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state if no entities detected */}
              {!data.entities?.vendors?.length &&
                !data.entities?.dates?.length &&
                !data.entities?.amounts?.length &&
                !data.entities?.contacts?.length && (
                  <div
                    data-testid="no-entities-notice"
                    className="rounded-xl border border-[#282C35] p-6 text-center text-slate-400 text-xs"
                  >
                    No specific entity pills detected. Click below to run deep extraction on
                    receipt/invoice documents.
                  </div>
                )}

              {/* Deep Extraction Trigger Button */}
              <div className="pt-2">
                <button
                  type="button"
                  data-testid="deep-extract-btn"
                  onClick={() => manager.extractEntities(file)}
                  disabled={state.isExtractingEntities}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#60A5FA]/30 bg-[#60A5FA]/10 hover:bg-[#60A5FA]/20 text-xs font-medium text-[#60A5FA] transition-colors disabled:opacity-50"
                >
                  {state.isExtractingEntities ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#60A5FA] border-t-transparent" />
                      <span>Extracting invoice/receipt entities...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      <span>Deep Extract (Invoice / Receipt Schema)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Active Tab View: ACTIONS */}
          {activeTab === 'actions' && data && (
            <div data-testid="tab-actions-content" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Follow-up Action Items
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  {Object.values(completedActions).filter(Boolean).length}/
                  {data.actionItems?.length || 0} completed
                </span>
              </div>

              {data.actionItems && data.actionItems.length > 0 ? (
                <div className="space-y-2.5">
                  {data.actionItems.map((item, idx) => {
                    const isDone = !!completedActions[item];
                    return (
                      <div
                        key={`action-${idx}`}
                        data-testid="action-item-card"
                        onClick={() => toggleAction(item)}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                          isDone
                            ? 'border-emerald-500/30 bg-emerald-950/10 text-slate-400'
                            : 'border-[#282C35] bg-[#16181D]/80 hover:bg-[#282C35]/30 text-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          aria-label={isDone ? 'Mark task incomplete' : 'Mark task complete'}
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            isDone
                              ? 'border-emerald-500 bg-emerald-500 text-black'
                              : 'border-slate-500 hover:border-[#FF8C42]'
                          }`}
                        >
                          {isDone && (
                            <svg
                              className="h-3 w-3 stroke-[3]"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                        <span
                          className={`text-xs leading-relaxed ${isDone ? 'line-through text-slate-500' : ''}`}
                        >
                          {item}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-[#282C35] p-6 text-center text-slate-400 text-xs">
                  No explicit action items detected for this document.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Controls */}
        <div className="border-t border-[#282C35] bg-[#16181D]/90 p-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Quanty ONNX Inference Ready</span>
          </div>

          <button
            type="button"
            data-testid="regenerate-btn"
            onClick={() => manager.generateSummary(file)}
            disabled={state.status === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#282C35] hover:border-[#FF8C42]/50 hover:bg-[#282C35] text-slate-300 hover:text-[#FF8C42] transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Regenerate</span>
          </button>
        </div>
      </aside>
    </>
  );
}
