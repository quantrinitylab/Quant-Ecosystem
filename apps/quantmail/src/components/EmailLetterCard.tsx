'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from './InboxToast';
import type { Email, EmailAttachment } from '../types';

export interface EmailLetterCardProps {
  email: Email;
  className?: string;
}

export function EmailLetterCard({ email, className = '' }: EmailLetterCardProps) {
  const [showQuoted, setShowQuoted] = useState(false);

  const senderName = email.from?.name || email.from?.email || 'Sender';
  const senderEmail = email.from?.email || '';
  const rawBody = email.bodyText || email.snippet || '';

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

  // Try to detect salutation and signoff
  const bodyParagraphs = mainText.split('\n\n').filter(Boolean);
  const firstParagraph = bodyParagraphs[0] || '';
  const isSalutation = /^(dear|hello|hi|hey|greetings|to whom|good morning|good afternoon)/i.test(
    firstParagraph.trim(),
  );

  const attachments: EmailAttachment[] = email.attachments || [];

  return (
    <div
      className={`relative rounded-2xl sm:rounded-3xl border border-zinc-800/80 bg-[#0c0e14] shadow-xl p-5 sm:p-7 overflow-hidden ${className}`}
    >
      {/* Top Header: Clean Subject & From Email */}
      <div className="pb-4 border-b border-zinc-800/70 space-y-1">
        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
          {email.subject || '(No Subject)'}
        </h3>
        {senderEmail && (
          <div className="text-xs text-zinc-400 font-mono">
            From: <span className="text-amber-400/90">{senderEmail}</span>
          </div>
        )}
      </div>

      {/* Structured Message Body */}
      <div className="py-4 space-y-4 text-zinc-200 text-sm sm:text-[15px] leading-relaxed">
        {/* Salutation Greeting */}
        {isSalutation && (
          <p className="font-semibold text-amber-200/90 text-base">{firstParagraph}</p>
        )}

        {/* Main Body Paragraphs */}
        <div className="whitespace-pre-wrap font-sans text-zinc-200 leading-relaxed space-y-3">
          {isSalutation ? bodyParagraphs.slice(1).join('\n\n') : mainText || 'No message content.'}
        </div>

        {/* Quoted Text Accordion */}
        {quotedText && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowQuoted(!showQuoted)}
              className="text-xs text-amber-400/90 hover:underline flex items-center gap-1.5 font-mono"
            >
              <span>{showQuoted ? '▲ Hide' : '▼ Show'} quoted conversation</span>
            </button>

            <AnimatePresence>
              {showQuoted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 pl-3 border-l-2 border-zinc-700 text-xs text-zinc-400 whitespace-pre-wrap font-mono"
                >
                  {quotedText}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Closing Line & Clean Signature Block */}
        <div className="pt-4 mt-4 border-t border-zinc-800/60 space-y-0.5">
          <p className="text-xs text-zinc-400 italic">Yours faithfully,</p>
          <p className="text-xs text-amber-400/90 font-mono">{senderEmail || senderName}</p>
        </div>
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
