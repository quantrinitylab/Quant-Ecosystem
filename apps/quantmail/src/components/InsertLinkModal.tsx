'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconX } from './icons';

interface InsertLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string, url: string) => void;
  initialText?: string;
}

export function InsertLinkModal({
  isOpen,
  onClose,
  onInsert,
  initialText = '',
}: InsertLinkModalProps) {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    const finalUrl =
      url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')
        ? url.trim()
        : `https://${url.trim()}`;
    const displayText = text.trim() || finalUrl;
    onInsert(displayText, finalUrl);
    setText('');
    setUrl('');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-10 w-full max-w-md rounded-2xl border border-[#282C35] bg-[#121622] p-5 shadow-2xl space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#282C35]/80 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <svg
                className="size-4 text-[#FF8C42]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Insert Link
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close insert link dialog"
              className="inline-flex items-center justify-center size-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 -mr-1.5 sm:mr-0 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <IconX size={15} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#A1A4AC] mb-1">
                Text to display
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Project Deliverables Document"
                className="w-full rounded-xl bg-[#111318]/90 border border-[#282C35] px-3 py-2 text-xs text-white placeholder-[#6B6E76] focus:outline-none focus:border-[#FF8C42]/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A4AC] mb-1">
                Web address (URL) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com or mailto:user@domain.com"
                required
                className="w-full rounded-xl bg-[#111318]/90 border border-[#282C35] px-3 py-2 text-xs text-white placeholder-[#6B6E76] focus:outline-none focus:border-[#FF8C42]/50"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#282C35]/80">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!url.trim()}
                className="px-4 py-1.5 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] text-[#111111] text-xs font-semibold shadow-sm transition-all disabled:opacity-40"
              >
                Insert Link
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
