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
      className={`relative rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-[#141722] via-[#0f121a] to-[#0b0e14] shadow-2xl p-5 sm:p-8 overflow-hidden ${className}`}
    >
      {/* Background Subtle Watermark & Luxury Highlights */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-amber-500/5 via-cyan-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-500/5 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Top Letterhead Header: Official Circular Stamp + Cursive Signature */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800/70">
        {/* Left Side: Brand Wordmark & Letter Record Metadata */}
        <div className="flex flex-col space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="text-lg sm:text-xl font-serif font-black tracking-wider uppercase text-amber-300"
              style={{ fontFamily: '"Cinzel", "Georgia", serif' }}
            >
              QuantMail
            </span>
            <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
              · Dispatch Record ·
            </span>
          </div>

          <div className="text-xs text-zinc-300 space-y-0.5 pt-1">
            <div className="font-bold text-white text-sm sm:text-base">
              {email.subject || '(No Subject)'}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono">
              From: <span className="text-zinc-200">{senderName}</span> &lt;{senderEmail}&gt;
            </div>
          </div>
        </div>

        {/* Right Side: Official Circular Wax/Rubber Stamp & Cursive Signature */}
        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
          {/* Cursive Signature Seal */}
          <div className="text-right hidden sm:block">
            <div
              className="text-sm text-amber-200/90 font-serif italic tracking-wide"
              style={{ fontFamily: '"Caveat", "Brush Script MT", cursive' }}
            >
              Verified Electronic Transmission
            </div>
            <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
              Quantrinity Network
            </div>
          </div>

          {/* Official Dual-Concentric Circular Stamp Seal: quantmail.in by QUANTRINITY */}
          <div className="relative size-18 sm:size-20 rounded-full border-2 border-amber-500/60 flex flex-col items-center justify-center text-amber-400 p-1.5 select-none shadow-[0_0_15px_rgba(245,158,11,0.18)] bg-amber-500/5 transform -rotate-6 shrink-0">
            {/* Outer dotted track */}
            <div className="absolute inset-1 rounded-full border border-dashed border-amber-500/40" />

            <span
              className="text-[7.5px] font-serif font-black tracking-wider text-amber-300 uppercase"
              style={{ fontFamily: '"Cinzel", serif' }}
            >
              quantmail.in
            </span>
            <div className="my-0.5 h-px w-8 bg-amber-500/40" />
            <span className="text-[6px] font-mono tracking-widest uppercase text-amber-400/80">
              by
            </span>
            <span className="text-[7px] font-mono font-black tracking-widest uppercase text-amber-300">
              QUANTRINITY
            </span>
          </div>
        </div>
      </div>

      {/* Structured Message Anatomy Body */}
      <div className="py-5 space-y-4 text-zinc-200 text-sm sm:text-[15px] leading-relaxed">
        {/* Salutation Greeting */}
        {isSalutation && (
          <p className="font-serif font-semibold text-amber-200/90 text-base">{firstParagraph}</p>
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

        {/* Closing Line & Signature Block */}
        <div className="pt-5 mt-5 border-t border-zinc-800/60 flex flex-col sm:flex-row items-start sm:items-baseline justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs text-zinc-400 italic font-serif">Yours faithfully,</p>
            <p className="text-sm font-bold text-white tracking-wide">{senderName}</p>
            <p className="text-xs text-zinc-500 font-mono">{senderEmail}</p>
          </div>

          <div className="text-[10px] font-mono text-zinc-500 self-end sm:self-auto">
            <span>256-bit TLS · E2EE Authenticated</span>
          </div>
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
              return (
                <div
                  key={att.id}
                  onClick={() => showToast({ text: `Downloading ${att.filename}…`, type: 'info' })}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 hover:border-amber-500/50 hover:bg-zinc-800/90 transition-all cursor-pointer group shadow-md"
                >
                  <div className="size-10 rounded-xl bg-zinc-950 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                    {isImg ? '🖼️' : '📄'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate" title={att.filename}>
                      {att.filename}
                    </p>
                    <p className="text-[10px] text-zinc-400">{(att.size / 1024).toFixed(1)} KB</p>
                  </div>

                  <button
                    type="button"
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
