'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { ConversationExportService } from '../services/conversation-export.service';
import type { ExportFormat } from '../services/conversation-export.service';
import {
  toExportConversation,
  downloadExport,
  type ExportableConversation,
  type ExportableMessage,
} from '../lib/export-conversation';

interface ExportMenuProps {
  conversation: ExportableConversation | null;
  messages: ExportableMessage[];
  className?: string;
}

const FORMAT_ICONS: Record<ExportFormat, string> = {
  json: '{ }',
  markdown: 'MD',
  text: 'TXT',
  csv: 'CSV',
};

const exportService = new ConversationExportService();

export function ExportMenu({ conversation, messages, className = '' }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const exportableCount = useMemo(
    () =>
      messages.filter((m) => !m.pending && !m.isStreaming && m.content.trim().length > 0).length,
    [messages],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleExport = (format: ExportFormat) => {
    if (!conversation) return;
    const exportable = toExportConversation(conversation, messages);
    if (exportable.messages.length === 0) return;
    const result = exportService.export(exportable, format);
    downloadExport(result);
    setIsOpen(false);
  };

  const disabled = !conversation || exportableCount === 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <motion.button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        whileHover={disabled ? undefined : { scale: 1.02 }}
        whileTap={disabled ? undefined : { scale: 0.98 }}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--surface-elevated)] transition-colors text-sm min-h-[44px] ${
          disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:bg-[var(--surface-hover)] cursor-pointer'
        }`}
        aria-label="Export conversation"
        aria-expanded={isOpen}
        title={disabled ? 'No messages to export yet' : 'Export this conversation'}
      >
        <svg
          className="w-4 h-4 text-[var(--foreground-secondary)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
          />
        </svg>
        <span className="font-medium text-[var(--foreground)] hidden sm:inline">Export</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', ...spring.stiff }}
            className="absolute top-full right-0 mt-2 w-56 rounded-xl border border-[var(--quant-border)] bg-[var(--surface-elevated)] shadow-lg z-50"
          >
            <div className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-wide text-[var(--foreground-secondary)]">
              Download {exportableCount} message{exportableCount === 1 ? '' : 's'} as
            </div>
            <div className="p-2 pt-0 space-y-0.5">
              {exportService.getSupportedFormats().map(({ format, label }) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => handleExport(format)}
                  className="w-full flex items-center gap-3 text-left px-2.5 py-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <span className="w-9 text-[10px] font-mono font-semibold text-center px-1.5 py-1 rounded bg-[var(--surface-hover)] text-[var(--foreground-secondary)]">
                    {FORMAT_ICONS[format]}
                  </span>
                  <span className="text-sm text-[var(--foreground)]">{label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ExportMenu;
