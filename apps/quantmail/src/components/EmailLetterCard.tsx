'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './InboxToast';
import { IconChevronDown, IconDownload, IconPaperclip, MimeTypeIcon } from './icons';
import { repairMojibake, useSafeEmailHtml } from '../lib/safe-html';
import type { Email, EmailAttachment } from '../types';

export interface EmailLetterCardProps {
  email: Email;
  className?: string;
}

export function EmailLetterCard({ email, className = '' }: EmailLetterCardProps) {
  const [showQuoted, setShowQuoted] = useState(false);

  // `bodyHtml` is attacker-controlled — it arrives over SMTP from third parties.
  // DOMPurify runs last inside this hook and yields '' when nothing safe is left,
  // in which case the plain-text body below is rendered instead.
  const safeHtml = useSafeEmailHtml(email.bodyHtml);

  const rawBody = repairMojibake(email.bodyText || email.snippet || '');

  // Parse quoted lines starting with '>'
  const lines = rawBody.split('\n');
  const mainLines: string[] = [];
  const quotedLines: string[] = [];
  let inQuote = false;

  for (const line of lines) {
    if (line.startsWith('>')) {
      inQuote = true;
      quotedLines.push(line.replace(/^>\s?/, ''));
    } else if (inQuote && line.trim() === '') {
      quotedLines.push('');
    } else {
      inQuote = false;
      mainLines.push(line);
    }
  }

  const mainText = mainLines.join('\n').trim();
  const quotedText = quotedLines.join('\n').trim();

  const attachments: EmailAttachment[] = email.attachments || [];

  return (
    <div className={`relative ${className}`}>
      {/* Email Body */}
      <div className="text-sm leading-7 text-[#F5F5F5] sm:text-[15px]">
        {safeHtml ? (
          <div
            className="email-html-content prose prose-invert max-w-none break-words font-sans font-normal leading-7 text-[#F5F5F5]"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <div className="space-y-3 whitespace-pre-wrap font-sans font-normal leading-7 text-[#F5F5F5]">
            {mainText || 'No message content.'}
          </div>
        )}

        {/* Quoted Text Accordion */}
        {quotedText && (
          <div className="mt-3 border-t border-[#282C35]/60 pt-3">
            <button
              type="button"
              onClick={() => setShowQuoted(!showQuoted)}
              className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-[#FF8C42] transition-colors hover:text-[#FF9B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              aria-expanded={showQuoted}
            >
              <IconChevronDown
                size={12}
                className={`transition-transform ${showQuoted ? 'rotate-180' : ''}`}
              />
              <span>{showQuoted ? 'Hide quoted message' : 'Show quoted message'}</span>
            </button>

            <AnimatePresence>
              {showQuoted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 pl-3 border-l-2 border-[#3A404D] text-xs text-[#A1A4AC] whitespace-pre-wrap font-sans"
                >
                  {quotedText}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Attachments Section */}
      {attachments.length > 0 && (
        <div className="mt-5 border-t border-[#282C35]/80 pt-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#A1A4AC]">
            <IconPaperclip size={13} />
            <span>Attachments</span>
            <span className="rounded-full bg-[#282C35] px-2 text-[10px] text-[#A1A4AC]">
              {attachments.length}
            </span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {attachments.map((att) => {
              const isImg = att.mimeType?.startsWith('image/');
              const handleDownload = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (att.url) {
                  const a = document.createElement('a');
                  a.href = att.url;
                  a.download = att.filename || 'attachment';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  showToast({ text: `Downloading ${att.filename}…`, type: 'success' });
                } else {
                  showToast({ text: `Downloading ${att.filename}…`, type: 'info' });
                }
              };

              return (
                <button
                  key={att.id}
                  type="button"
                  onClick={handleDownload}
                  aria-label={`Download ${att.filename}`}
                  className="group flex w-full min-h-touch items-center gap-3 rounded-xl bg-[#111318] p-3 text-left shadow-[inset_0_0_0_1px_#282C35] transition-colors hover:bg-[#16181D] hover:shadow-[inset_0_0_0_1px_#5C3016] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#090A0C] text-[#A1A4AC]">
                    {isImg && att.url ? (
                      <img
                        src={att.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full rounded-lg object-cover"
                      />
                    ) : (
                      <MimeTypeIcon mimeType={att.mimeType} size={20} />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-xs font-semibold text-[#F5F5F5]"
                      title={att.filename}
                    >
                      {att.filename}
                    </span>
                    <span className="block text-[10px] text-[#A1A4AC]">
                      {att.size > 0 ? `${(att.size / 1024).toFixed(1)} KB` : 'Attachment'}
                    </span>
                  </span>

                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-[#A1A4AC] transition-colors group-hover:text-[#FF8C42]"
                    aria-hidden="true"
                  >
                    <IconDownload size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
