'use client';

import React, { useState } from 'react';

export interface PhotoDrawingStudioProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onFinish?: () => void;
  onDone?: () => void;
}

export function PhotoDrawingStudio({
  isOpen = true,
  onClose,
  onCancel,
  onFinish,
  onDone,
}: PhotoDrawingStudioProps) {
  const [activeTool, setActiveTool] = useState<'ink' | 'crop' | 'text' | 'rotate'>('ink');
  const [inkColor, setInkColor] = useState('var(--quant-destructive)');

  if (!isOpen) return null;

  const colors = ['var(--quant-destructive)', '#0078D4', '#EAB308', '#10B981', '#FFFFFF', 'black'];

  return (
    <div
      data-testid="photo-drawing-studio"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black p-4 text-white select-none"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="drawing-close-btn"
          onClick={onClose || onCancel}
          className="text-sm font-semibold text-white/80"
        >
          ✕ Close
        </button>
        <span className="text-xs font-bold uppercase tracking-wider text-white/60">Photo Studio</span>
        <button
          type="button"
          data-testid="drawing-finish-btn"
          onClick={onFinish || onDone}
          className="rounded-full bg-[#0078D4] px-4 py-1.5 text-xs font-bold text-white shadow"
        >
          ✓ Finish
        </button>
      </div>

      {/* Canvas Viewport */}
      <div className="relative flex flex-1 items-center justify-center p-4">
        <div className="relative aspect-[3/4] w-full max-w-[280px] rounded-2xl bg-zinc-800 border-2 border-white/20 overflow-hidden shadow-2xl flex items-center justify-center">
          <span className="text-5xl">🖼️</span>
          {/* Simulated Ink Stroke */}
          <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 100 100">
            <path d="M 20 40 Q 50 20 80 60" stroke={inkColor} strokeWidth="4" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Bottom Tool Palette */}
      <div className="space-y-3">
        {/* Color Palette */}
        {activeTool === 'ink' && (
          <div data-testid="ink-color-palette" className="flex justify-center gap-3">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                data-testid={`ink-color-${c}`}
                onClick={() => setInkColor(c)}
                style={{ backgroundColor: c }}
                className={`size-7 rounded-full transition-transform ${
                  inkColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : ''
                }`}
              />
            ))}
          </div>
        )}

        {/* Toolbar Buttons */}
        <div className="flex items-center justify-around rounded-2xl bg-zinc-900/90 py-2.5 text-xs font-semibold">
          <button
            type="button"
            data-testid="tool-ink-btn"
            onClick={() => setActiveTool('ink')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'ink' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>✏️</span>
            <span>Ink</span>
          </button>
          <button
            type="button"
            data-testid="tool-crop-btn"
            onClick={() => setActiveTool('crop')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'crop' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>✂️</span>
            <span>Crop</span>
          </button>
          <button
            type="button"
            data-testid="tool-text-btn"
            onClick={() => setActiveTool('text')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'text' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>🔤</span>
            <span>Text</span>
          </button>
          <button
            type="button"
            data-testid="tool-rotate-btn"
            onClick={() => setActiveTool('rotate')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'rotate' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>🔄</span>
            <span>Rotate</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export const MobilePhotoDrawingStudio = PhotoDrawingStudio;
