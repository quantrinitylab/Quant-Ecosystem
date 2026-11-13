'use client';

import React, { useState } from 'react';

const IconClose = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconCheck = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export interface DensitySelectorSheetProps {
  currentDensity?: 'roomy' | 'cozy' | 'compact';
  onSelectDensity?: (density: 'roomy' | 'cozy' | 'compact') => void;
  onClose?: () => void;
}

export const DensitySelectorSheet: React.FC<DensitySelectorSheetProps> = ({
  currentDensity = 'roomy',
  onSelectDensity,
  onClose,
}) => {
  const [density, setDensity] = useState<'roomy' | 'cozy' | 'compact'>(currentDensity);

  const handleSelect = (d: 'roomy' | 'cozy' | 'compact') => {
    setDensity(d);
    onSelectDensity?.(d);
  };

  return (
    <div
      data-testid="density-selector-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Mail Density</h2>
        <button data-testid="close-density-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Appearance Density
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          <button
            data-testid="density-option-roomy"
            onClick={() => handleSelect('roomy')}
            className="w-full flex items-center justify-between p-3.5 text-left text-xs"
          >
            <div>
              <div className="font-semibold text-sm">Roomy</div>
              <div className="text-[11px] text-[var(--text-muted)]">Default multi-line preview with contact avatars</div>
            </div>
            {density === 'roomy' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>

          <button
            data-testid="density-option-cozy"
            onClick={() => handleSelect('cozy')}
            className="w-full flex items-center justify-between p-3.5 text-left text-xs"
          >
            <div>
              <div className="font-semibold text-sm">Cozy</div>
              <div className="text-[11px] text-[var(--text-muted)]">Balanced 2-line preview for swift skimming</div>
            </div>
            {density === 'cozy' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>

          <button
            data-testid="density-option-compact"
            onClick={() => handleSelect('compact')}
            className="w-full flex items-center justify-between p-3.5 text-left text-xs"
          >
            <div>
              <div className="font-semibold text-sm">Compact</div>
              <div className="text-[11px] text-[var(--text-muted)]">Tight single-line rows for maximum information density</div>
            </div>
            {density === 'compact' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
          <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Preview ({density})
          </div>
          <div
            data-testid="density-preview-card"
            className={`border border-[var(--border-subtle)] rounded-lg p-2.5 bg-[var(--bg-app)] ${
              density === 'compact' ? 'py-1 text-xs' : density === 'cozy' ? 'py-2 text-xs' : 'py-3 text-xs'
            }`}
          >
            <div className="flex items-center justify-between font-semibold">
              <span>Alex Smith</span>
              <span className="text-[10px] text-[var(--text-muted)]">8:16 PM</span>
            </div>
            <div className="font-medium text-[11px] truncate">Follow-Up on Work</div>
            {density !== 'compact' && (
              <div className="text-[10px] text-[var(--text-muted)] line-clamp-1">
                Hi Sam, I wanted to follow up regarding our recent work discussion...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export type MobileDensitySelectorSheetProps = DensitySelectorSheetProps;
export const MobileDensitySelectorSheet = DensitySelectorSheet;
