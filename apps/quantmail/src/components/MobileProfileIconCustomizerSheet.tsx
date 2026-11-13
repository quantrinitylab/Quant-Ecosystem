'use client';

import React, { useState } from 'react';

export function MobileProfileIconCustomizerSheet({
  isOpen,
  onClose,
  onSelectIcon,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectIcon: (choice: string) => void;
}) {
  const [selectedMode, setSelectedMode] = useState<'initials' | 'custom'>('initials');
  const [selectedColor, setSelectedColor] = useState('#0078D4');
  const [selectedIconEmoji, setSelectedIconEmoji] = useState('⚡');

  if (!isOpen) return null;

  const colorPalette = ['#0078D4', '#10B981', '#F59E0B', 'var(--quant-destructive)', '#8B5CF6', '#EC4899'];
  const iconEmojis = ['⚡', '🚀', '⭐', '🛡️', '💼', '🎯', '💡', '🔥'];

  return (
    <div
      data-testid="profile-icon-customizer-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
    >
      <div className="rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            data-testid="profile-icon-close-btn"
            onClick={onClose}
            className="text-sm text-[var(--quant-muted-foreground)]"
          >
            Cancel
          </button>
          <h3 className="text-base font-semibold">Show As</h3>
          <button
            type="button"
            data-testid="profile-icon-done-btn"
            onClick={() => {
              onSelectIcon(selectedMode === 'custom' ? selectedIconEmoji : 'SL');
              onClose();
            }}
            className="text-sm font-semibold text-[#0078D4]"
          >
            Done
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div className="rounded-2xl border border-[var(--quant-border)] divide-y divide-[var(--quant-border)] overflow-hidden text-sm">
            <button
              type="button"
              data-testid="show-as-initials-btn"
              onClick={() => setSelectedMode('initials')}
              className="flex w-full items-center justify-between p-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#0078D4] text-xs font-bold text-white">
                  SL
                </span>
                <span>Account Initials</span>
              </div>
              {selectedMode === 'initials' && <span className="text-[#0078D4] font-bold">✓</span>}
            </button>
            <button
              type="button"
              data-testid="show-as-custom-btn"
              onClick={() => setSelectedMode('custom')}
              className="flex w-full items-center justify-between p-3.5"
            >
              <div className="flex items-center gap-3">
                <span
                  style={{ backgroundColor: selectedColor }}
                  className="grid size-7 place-items-center rounded-full text-xs text-white"
                >
                  {selectedIconEmoji}
                </span>
                <span>Customise</span>
              </div>
              {selectedMode === 'custom' && <span className="text-[#0078D4] font-bold">✓</span>}
            </button>
          </div>

          {/* Color & Icon Grid when Customise is selected */}
          {selectedMode === 'custom' && (
            <div data-testid="customise-icon-grid" className="space-y-3 pt-2">
              <span className="text-xs font-semibold text-[var(--quant-muted-foreground)]">Colour</span>
              <div className="flex gap-2">
                {colorPalette.map((col) => (
                  <button
                    key={col}
                    type="button"
                    style={{ backgroundColor: col }}
                    onClick={() => setSelectedColor(col)}
                    className={`size-8 rounded-full border-2 ${
                      selectedColor === col ? 'border-white scale-110 shadow-md' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>

              <span className="text-xs font-semibold text-[var(--quant-muted-foreground)] block pt-2">Icon</span>
              <div className="grid grid-cols-4 gap-2">
                {iconEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedIconEmoji(emoji)}
                    className={`p-2 rounded-xl text-lg border ${
                      selectedIconEmoji === emoji ? 'border-[#0078D4] bg-[#0078D4]/15' : 'border-[var(--quant-border)]'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ProfileIconCustomizerSheet = MobileProfileIconCustomizerSheet;
