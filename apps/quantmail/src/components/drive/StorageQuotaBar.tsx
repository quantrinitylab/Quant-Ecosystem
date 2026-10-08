'use client';

import React, { useState, useEffect } from 'react';
import { browserApiRequest } from '../../services/browser-api-request';
import { formatBytes } from '../../lib/format-bytes';

export interface StorageQuotaData {
  usedBytes: number;
  limitBytes: number;
  tier: string;
  percentUsed: number;
}

export interface StorageQuotaState {
  quota: StorageQuotaData;
  isLoading: boolean;
  error: string | null;
  /**
   * Whether a real quota has been established — from `initialQuota` or a
   * successful `loadQuota()`. Until then the bar renders "Calculating…":
   * the 0 B / 15 GB placeholder default must never be presented as a reading,
   * because it is not one (it is what the old header chip showed, and it
   * disagreed with every other surface).
   */
  loaded: boolean;
}

export interface StorageQuotaManagerOptions {
  apiFetch?: typeof browserApiRequest;
  initialQuota?: Partial<StorageQuotaData>;
  autoLoad?: boolean;
}

const DEFAULT_QUOTA: StorageQuotaData = {
  usedBytes: 0,
  limitBytes: 15 * 1024 ** 3, // 15 GB
  tier: 'FREE',
  percentUsed: 0,
};

/**
 * Headless Manager orchestrating storage quota calculation,
 * API polling/fetching, warning threshold evaluation, and state subscriptions.
 */
export class StorageQuotaManager {
  private state: StorageQuotaState;
  private listeners: Set<(state: StorageQuotaState) => void> = new Set();
  private apiFetch: typeof browserApiRequest;

  constructor(options?: StorageQuotaManagerOptions) {
    this.apiFetch = options?.apiFetch ?? browserApiRequest;

    const initialUsed = options?.initialQuota?.usedBytes ?? DEFAULT_QUOTA.usedBytes;
    const initialLimit = options?.initialQuota?.limitBytes ?? DEFAULT_QUOTA.limitBytes;
    const computedPercent =
      options?.initialQuota?.percentUsed !== undefined
        ? options?.initialQuota.percentUsed
        : initialLimit > 0
          ? (initialUsed / initialLimit) * 100
          : 0;

    this.state = {
      quota: {
        ...DEFAULT_QUOTA,
        ...options?.initialQuota,
        usedBytes: initialUsed,
        limitBytes: initialLimit,
        percentUsed: computedPercent,
      },
      isLoading: false,
      error: null,
      // An explicitly supplied quota is real data; otherwise nothing is known
      // until the first successful loadQuota().
      loaded: Boolean(options?.initialQuota),
    };

    if (options?.autoLoad) {
      void this.loadQuota();
    }
  }

  public getState(): StorageQuotaState {
    return {
      ...this.state,
      quota: { ...this.state.quota },
    };
  }

  public subscribe(listener: (state: StorageQuotaState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const current = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch {
        // Silently ignore listener errors
      }
    });
  }

  public setQuota(quotaUpdate: Partial<StorageQuotaData>): void {
    const usedBytes = quotaUpdate.usedBytes ?? this.state.quota.usedBytes;
    const limitBytes = quotaUpdate.limitBytes ?? this.state.quota.limitBytes;
    const percentUsed =
      quotaUpdate.percentUsed !== undefined
        ? quotaUpdate.percentUsed
        : limitBytes > 0
          ? (usedBytes / limitBytes) * 100
          : 0;

    this.state.quota = {
      ...this.state.quota,
      ...quotaUpdate,
      usedBytes,
      limitBytes,
      percentUsed,
    };
    this.notify();
  }

  /**
   * Warning threshold state:
   * <80% -> normal
   * 80-90% -> warning
   * >90% -> critical
   */
  public getWarningStatus(): 'normal' | 'warning' | 'critical' {
    const pct = this.state.quota.percentUsed;
    if (pct > 90) return 'critical';
    if (pct >= 80) return 'warning';
    return 'normal';
  }

  /**
   * Formats current quota usage as a human-readable string:
   * e.g. "1.5 GB of 15 GB (10%) used"
   */
  public getFormattedUsage(): string {
    const { usedBytes, limitBytes, percentUsed } = this.state.quota;
    return `${formatBytes(usedBytes)} of ${formatBytes(limitBytes)} (${Math.round(percentUsed)}%) used`;
  }

  public async loadQuota(): Promise<StorageQuotaData> {
    this.state.isLoading = true;
    this.state.error = null;
    this.notify();

    try {
      const response = await this.apiFetch('/api/drive/quota');
      if (!response.ok) {
        throw new Error(`Failed to load storage quota: HTTP ${response.status}`);
      }

      const raw = await response.json();
      const usedBytes =
        typeof raw.usedBytes === 'number'
          ? raw.usedBytes
          : typeof raw.used === 'number'
            ? raw.used
            : 0;

      const limitBytes =
        typeof raw.limitBytes === 'number'
          ? raw.limitBytes
          : typeof raw.total === 'number'
            ? raw.total
            : DEFAULT_QUOTA.limitBytes;

      const tier = raw.tier || this.state.quota.tier || 'FREE';

      const percentUsed =
        typeof raw.percentUsed === 'number'
          ? raw.percentUsed
          : limitBytes > 0
            ? (usedBytes / limitBytes) * 100
            : 0;

      const updatedQuota: StorageQuotaData = {
        usedBytes,
        limitBytes,
        tier,
        percentUsed,
      };

      this.state.quota = updatedQuota;
      this.state.error = null;
      this.state.loaded = true;
      return updatedQuota;
    } catch (err: any) {
      this.state.error = err?.message || 'Error loading storage quota';
      return this.state.quota;
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  public destroy(): void {
    this.listeners.clear();
  }
}

export interface StorageQuotaBarProps {
  initialQuota?: StorageQuotaData;
  onUpgradeClick?: () => void;
  manager?: StorageQuotaManager;
}

/**
 * StorageQuotaBar Component
 *
 * Renders the real storage usage meter (used of limit), warning threshold
 * states (<80% normal, 80-90% warning, >90% critical), and an Upgrade Storage
 * trigger. The quota endpoint reports only used/limit, so no per-category
 * breakdown is shown. Until the first successful load the meter reads
 * "Calculating…" — the 0 B / 15 GB placeholder is never shown as a reading.
 */
export const StorageQuotaBar: React.FC<StorageQuotaBarProps> = ({
  initialQuota,
  onUpgradeClick,
  manager: customManager,
}) => {
  const [manager] = useState(
    () =>
      customManager ||
      new StorageQuotaManager({
        initialQuota,
        autoLoad: !initialQuota,
      }),
  );

  const [state, setState] = useState<StorageQuotaState>(() => manager.getState());

  useEffect(() => {
    const unsubscribe = manager.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, [manager]);

  const { quota, isLoading, error, loaded } = state;
  const warningStatus = manager.getWarningStatus();
  const percentUsedRounded = Math.min(100, Math.max(0, Math.round(quota.percentUsed)));

  // Status visual styles
  const statusConfig = {
    normal: {
      badgeBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      barColor: 'bg-[#60A5FA]',
      textColor: 'text-slate-300',
    },
    warning: {
      badgeBg: 'bg-[var(--quant-primary)]/15 text-[var(--quant-primary)] border-[var(--quant-primary)]/30',
      barColor: 'bg-[var(--quant-primary)]',
      textColor: 'text-[var(--quant-primary)]',
    },
    critical: {
      badgeBg: 'bg-red-500/15 text-red-400 border-red-500/30',
      barColor: 'bg-red-500',
      textColor: 'text-red-400',
    },
  }[warningStatus];

  return (
    <div
      data-testid="storage-quota-bar-container"
      className="w-full rounded-2xl bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] p-4 text-slate-200 shadow-md"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between mb-2">
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
              d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"
            />
          </svg>
          <span className="font-semibold text-xs tracking-wider uppercase text-slate-400">
            Storage Usage ({quota.tier})
          </span>
          {isLoading && (
            <svg
              className="w-3.5 h-3.5 animate-spin text-[#60A5FA]"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
        </div>

        {/* Upgrade Storage Action */}
        <button
          type="button"
          onClick={onUpgradeClick}
          data-testid="upgrade-storage-button"
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/90 text-black transition-colors duration-150 shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
          <span>Upgrade Storage</span>
        </button>
      </div>

      {/* Main Text Indicator — never the 0 B / 15 GB placeholder as a reading */}
      <div className="flex items-baseline justify-between mb-2">
        <span data-testid="quota-text-indicator" className="text-sm font-medium text-slate-100">
          {loaded
            ? `${formatBytes(quota.usedBytes)} of ${formatBytes(quota.limitBytes)} (${percentUsedRounded}%) used`
            : error
              ? 'Storage unavailable'
              : 'Calculating storage…'}
        </span>

        {/* Status Badge */}
        <span
          data-testid="quota-warning-badge"
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${statusConfig.badgeBg}`}
        >
          {warningStatus}
        </span>
      </div>

      {/* Usage Bar — real used-of-limit only (backend reports no category breakdown) */}
      <div
        data-testid="storage-usage-bar"
        className="w-full h-3 rounded-full bg-[var(--quant-surface-elevated)] overflow-hidden flex"
        role="progressbar"
        aria-label="Storage quota usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={loaded ? percentUsedRounded : undefined}
      >
        {loaded && quota.percentUsed > 0 && (
          <div
            data-testid="storage-usage-fill"
            style={{ width: `${Math.min(100, quota.percentUsed)}%` }}
            title={`${formatBytes(quota.usedBytes)} of ${formatBytes(quota.limitBytes)} (${percentUsedRounded}%)`}
            className={`h-full ${statusConfig.barColor} transition-all duration-300`}
          />
        )}
      </div>

      {/* Threshold Warning Banner */}
      {warningStatus === 'warning' && (
        <div
          data-testid="warning-threshold-banner"
          className="mt-2.5 px-3 py-1.5 rounded-lg bg-[var(--quant-primary)]/10 border border-[var(--quant-primary)]/30 text-xs text-[var(--quant-primary)] flex items-center gap-2"
        >
          <svg
            className="w-4 h-4 shrink-0 text-[var(--quant-primary)]"
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
          <span>
            Storage is almost full ({percentUsedRounded}%). Upgrade soon to avoid upload
            interruptions.
          </span>
        </div>
      )}

      {warningStatus === 'critical' && (
        <div
          data-testid="critical-threshold-banner"
          className="mt-2.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2"
        >
          <svg
            className="w-4 h-4 shrink-0 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Critical: Over 90% of storage used. New file uploads will be blocked once limit is
            reached.
          </span>
        </div>
      )}

      {/* Error State Banner */}
      {error && (
        <div
          data-testid="quota-error-banner"
          className="mt-2 text-xs text-red-400 flex items-center gap-1.5"
        >
          <svg
            className="w-3.5 h-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
