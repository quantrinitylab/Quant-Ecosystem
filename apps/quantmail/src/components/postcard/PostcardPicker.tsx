'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_VINTAGE_PRESETS, type PostcardTemplate } from '../../types/postcard';

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
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <header className="p-5 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">💌</span>
              <div>
                <h2 className="text-base font-serif font-bold text-white">
                  Select Postcard Stationery
                </h2>
                <p className="text-xs text-zinc-400">
                  Pick a handcrafted vintage postcard template or standard mail format
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              ✕
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
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-mono text-sm">
                  ✉️
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white">Standard Email</h4>
                  <p className="text-[11px] text-zinc-400">
                    Clean, traditional rich-text email layout without postcard styling
                  </p>
                </div>
              </div>
              {selectedTemplate === null && (
                <span className="text-xs font-bold text-amber-400">Selected ✓</span>
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
                        ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-amber-500/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-amber-400 mb-1.5">
                        <span className="uppercase">{template.category}</span>
                        {template.isCustom && (
                          <span className="px-1.5 py-0.2 text-[9px] rounded bg-amber-500/20 text-amber-300 font-bold">
                            CUSTOM
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-serif font-bold text-white mb-1">
                        {template.name}
                      </h4>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500 font-mono">
                        {template.paperTexture.replace('-', ' ')}
                      </span>
                      <span className="text-amber-400 font-semibold font-mono">
                        {template.stamp.value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <footer className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
            <a
              href="/postcards"
              className="text-xs font-semibold text-amber-400 hover:underline flex items-center gap-1.5"
            >
              <span>🎨 Open Postcard Studio</span>
              <span>➔</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white"
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
