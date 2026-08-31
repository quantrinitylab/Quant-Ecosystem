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
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#111318] border border-[#282C35] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <header className="p-5 border-b border-[#282C35] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-[#FF8C42]">
                <IconMailHeart size={19} />
              </span>
              <div>
                <h2 className="text-base font-serif font-bold text-white">
                  Select Postcard Stationery
                </h2>
                <p className="text-xs text-[#A1A4AC]">
                  Pick a handcrafted vintage postcard template or standard mail format
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close postcard picker"
              className="size-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 shrink-0 rounded-lg flex items-center justify-center text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
                  ? 'border-[#FF8C42] bg-[#FF8C42]/10'
                  : 'border-[#282C35] bg-[#090A0C]/50 hover:border-[#3A404D]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-[#282C35] border border-[#3A404D] flex items-center justify-center text-[#A1A4AC]">
                  <IconMail size={18} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white">Standard Email</h4>
                  <p className="text-[11px] text-[#A1A4AC]">
                    Clean, traditional rich-text email layout without postcard styling
                  </p>
                </div>
              </div>
              {selectedTemplate === null && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FF8C42]">
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
                        ? 'border-[#FF8C42] bg-[#FF8C42]/10 shadow-[0_4px_16px_rgba(0,0,0,0.6)]'
                        : 'border-[#282C35] bg-[#090A0C]/60 hover:border-[#FF8C42]/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-[#FF8C42] mb-1.5">
                        <span className="uppercase">{template.category}</span>
                        {template.isCustom && (
                          <span className="px-1.5 py-0.2 text-[10px] rounded bg-[#FF8C42]/20 text-[#FFB875] font-bold">
                            CUSTOM
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-serif font-bold text-white mb-1">
                        {template.name}
                      </h4>
                      <p className="text-[11px] text-[#A1A4AC] line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[#282C35]/80 flex items-center justify-between text-[11px]">
                      <span className="text-[#A1A4AC] font-mono">
                        {template.paperTexture.replace('-', ' ')}
                      </span>
                      <span className="text-[#FF8C42] font-semibold font-mono">
                        {template.stamp.value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <footer className="p-4 border-t border-[#282C35] bg-[#090A0C]/80 flex items-center justify-between">
            <a
              href="/postcards"
              className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 text-xs font-semibold text-[#FF8C42] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] rounded"
            >
              <IconPalette size={14} />
              <span>Open Postcard Studio</span>
              <IconArrowRight size={13} />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg text-xs font-semibold bg-[#282C35] hover:bg-[#3A404D] text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
