'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './InboxToast';
import type { Email, EmailAttachment } from '../types';

export function sanitizeEmailText(text?: string): string {
  if (!text) return '';
  let clean = text;
  try {
    clean = decodeURIComponent(escape(text));
  } catch {
    clean = text
      .replace(/ðŸŽ‰/g, '🎉')
      .replace(/ðŸ‘\s*[\x80-\xBF]?/g, '👍')
      .replace(/ðŸ”¥/g, '🔥')
      .replace(/ðŸš€/g, '🚀')
      .replace(/âœ…/g, '✅')
      .replace(/â ¤ï¸ ?/g, '❤️')
      .replace(/ðŸ˜Š/g, '😊')
      .replace(/ðŸ’¡/g, '💡')
      .replace(/ðŸ’¬/g, '💬')
      .replace(/âš\xa0ï¸ ?/g, '⚠️')
      .replace(/â€™|â€˜/g, "'")
      .replace(/â€œ|â€ /g, '"')
      .replace(/â€“|â€”/g, '—')
      .replace(/â€¦/g, '…');
  }
  return clean.replace(/Â[\u00A0\s]?/g, ' ').replace(/\u00A0/g, ' ');
}

export interface EmailLetterCardProps {
  email: Email;
  className?: string;
}

export function EmailLetterCard({ email, className = '' }: EmailLetterCardProps) {
  const [showQuoted, setShowQuoted] = useState(false);

  const rawBody = sanitizeEmailText(email.bodyText || email.snippet || '');

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
    <div
      className={`relative rounded-2xl sm:rounded-3xl border border-zinc-800/80 bg-[#0c0e14] shadow-xl p-4 sm:p-6 overflow-hidden ${className}`}
    >
      {/* Email Body */}
      <div className="text-zinc-200 text-sm sm:text-[15px] leading-relaxed">
        {email.bodyHtml ? (
          <div
            className="email-html-content prose prose-invert max-w-none text-zinc-200 font-sans leading-relaxed break-words"
            dangerouslySetInnerHTML={{ __html: sanitizeEmailText(email.bodyHtml) }}
          />
        ) : (
          <div className="whitespace-pre-wrap font-sans text-zinc-200 leading-relaxed space-y-3">
            {mainText || 'No message content.'}
          </div>
        )}

        {/* Quoted Text Accordion */}
        {quotedText && (
          <div className="pt-3 mt-3 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={() => setShowQuoted(!showQuoted)}
              className="text-xs text-amber-400/90 hover:underline flex items-center gap-1.5 font-medium"
            >
              <span>{showQuoted ? '▲ Hide' : '▼ Show'} quoted message</span>
            </button>

            <AnimatePresence>
              {showQuoted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 pl-3 border-l-2 border-zinc-700 text-xs text-zinc-400 whitespace-pre-wrap font-sans"
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
        <div className="mt-5 pt-4 border-t border-zinc-800/80">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
            <span>📎 Attachments</span>
            <span className="px-2 py-0.2 rounded-full bg-zinc-800 text-[10px] text-zinc-300">
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
                <div
                  key={att.id}
                  onClick={handleDownload}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 hover:border-amber-500/50 hover:bg-zinc-800/90 transition-all cursor-pointer group shadow-md"
                >
                  <div className="size-10 rounded-xl bg-zinc-950 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform overflow-hidden">
                    {isImg && att.url ? (
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : isImg ? (
                      '🖼️'
                    ) : (
                      '📄'
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate" title={att.filename}>
                      {att.filename}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {att.size > 0 ? `${(att.size / 1024).toFixed(1)} KB` : 'Attachment'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownload}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 transition-colors"
                    title="Download"
                  >
                    <svg
                      className="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
