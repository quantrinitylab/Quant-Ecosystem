'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_VINTAGE_PRESETS, type PostcardTemplate } from '../../types/postcard';
import { IconArrowRight, IconCheck, IconMail, IconMailHeart, IconPalette, IconX } from '../icons';

interface PostcardPickerProps {
  selectedTemplate: PostcardTemplate | null;
  onSelectTemplate: (template: PostcardTemplate | null) => void;
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'quantmail_custom_postcards';

export function PostcardPicker({
  selectedTemplate,
  onSelectTemplate,
  isOpen,
  onClose,
}: PostcardPickerProps) {
  const [customCards, setCustomCards] = useState<PostcardTemplate[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCustomCards(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const allTemplates = [...customCards, ...DEFAULT_VINTAGE_PRESETS];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[var(--quant-surface)] border border-[var(--quant-surface-elevated)] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <header className="p-5 border-b border-[var(--quant-surface-elevated)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-[var(--quant-primary)]">
                <IconMailHeart size={19} />
              </span>
              <div>
                <h2 className="text-base font-serif font-bold text-white">
                  Select Postcard Stationery
                </h2>
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  Pick a handcrafted vintage postcard template or standard mail format
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close postcard picker"
              className="size-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 shrink-0 rounded-lg flex items-center justify-center text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              <IconX size={15} />
            </button>
          </header>

          {/* Cards Grid */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Standard Mode Card */}
            <div
              onClick={() => {
                onSelectTemplate(null);
                onClose();
              }}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                selectedTemplate === null
                  ? 'border-[var(--quant-primary)] bg-[var(--quant-primary)]/10'
                  : 'border-[var(--quant-surface-elevated)] bg-[var(--quant-background)]/50 hover:border-[#3A404D]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#3A404D] flex items-center justify-center text-[var(--quant-muted-foreground)]">
                  <IconMail size={18} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white">Standard Email</h4>
                  <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                    Clean, traditional rich-text email layout without postcard styling
                  </p>
                </div>
              </div>
              {selectedTemplate === null && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--quant-primary)]">
                  Selected
                  <IconCheck size={13} />
                </span>
              )}
            </div>

            {/* Postcard Templates Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              {allTemplates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                return (
                  <div
                    key={template.id}
                    onClick={() => {
                      onSelectTemplate(template);
                      onClose();
                    }}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-[var(--quant-primary)] bg-[var(--quant-primary)]/10 shadow-[0_4px_16px_rgba(0,0,0,0.6)]'
                        : 'border-[var(--quant-surface-elevated)] bg-[var(--quant-background)]/60 hover:border-[var(--quant-primary)]/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-[var(--quant-primary)] mb-1.5">
                        <span className="uppercase">{template.category}</span>
                        {template.isCustom && (
                          <span className="px-1.5 py-px text-[10px] rounded bg-[var(--quant-primary)]/20 text-[var(--brand-accent)] font-bold">
                            CUSTOM
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-serif font-bold text-white mb-1">
                        {template.name}
                      </h4>
                      <p className="text-[11px] text-[var(--quant-muted-foreground)] line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[var(--quant-surface-elevated)]/80 flex items-center justify-between text-[11px]">
                      <span className="text-[var(--quant-muted-foreground)] font-mono">
                        {template.paperTexture.replace('-', ' ')}
                      </span>
                      <span className="text-[var(--quant-primary)] font-semibold font-mono">
                        {template.stamp.value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <footer className="p-4 border-t border-[var(--quant-surface-elevated)] bg-[var(--quant-background)]/80 flex items-center justify-between">
            <a
              href="/postcards"
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 text-xs font-semibold text-[var(--quant-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded"
            >
              <IconPalette size={14} />
              <span>Open Postcard Studio</span>
              <IconArrowRight size={13} />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg text-xs font-semibold bg-[var(--quant-surface-elevated)] hover:bg-[#3A404D] text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              Done
            </button>
          </footer>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default PostcardPicker;
