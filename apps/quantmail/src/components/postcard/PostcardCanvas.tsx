'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PostcardTemplate, PostcardPayload, PostcardSticker } from '../../types/postcard';

interface PostcardCanvasProps {
  template: PostcardTemplate;
  message?: string;
  recipientName?: string;
  recipientEmail?: string;
  senderName?: string;
  senderEmail?: string;
  dateString?: string;
  locationString?: string;
  editable?: boolean;
  onMessageChange?: (text: string) => void;
  onAddSticker?: (sticker: PostcardSticker) => void;
  className?: string;
  initialFlipped?: boolean;
  allowFlip?: boolean;
}

/**
 * Authentic Vintage Filigree Corner Flourish (SVG)
 */
function FiligreeCorner({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={`size-9 pointer-events-none opacity-65 ${className}`}
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M4 4h18c-4 0-10 6-10 10 0 6 8 8 8 16 0 5-4 10-10 10-4 0-6-3-6-6 0-5 6-8 6-14 0-6-4-10-6-16z" />
      <path d="M4 4v18c0-4 6-10 10-10 6 0 8 8 16 8 5 0 10-4 10-10 0-4-3-6-6-6-5 0-8 6-14 6-6 0-10-4-16-6z" />
      <circle cx="14" cy="14" r="2.5" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

/**
 * Authentic Vintage Perforated Postage Stamp & Wavy Rubber Cancellation Mark
 */
function VintagePostageStamp({
  stamp,
  isDark = false,
}: {
  stamp: PostcardTemplate['stamp'];
  isDark?: boolean;
}) {
  const inkColor = isDark ? '#F59E0B' : '#1C1917';
  const postmarkColor = isDark ? 'rgba(245, 158, 11, 0.75)' : 'rgba(28, 25, 23, 0.75)';

  return (
    <div className="relative inline-flex items-center select-none group">
      {/* ------------------------------------------------------------- */}
      {/* 1. RUBBER INK CANCELLATION POSTMARK (WAVY LINES & DUAL RING)  */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute -left-16 -top-3.5 z-20 pointer-events-none flex items-center gap-1.5 opacity-90">
        {/* Dual Ring Circular Postmark */}
        <div
          className="relative size-14 rounded-full border border-dashed flex flex-col items-center justify-center text-[7px] font-bold uppercase tracking-wider text-center p-1"
          style={{
            borderColor: postmarkColor,
            color: postmarkColor,
            transform: 'rotate(-14deg)',
          }}
        >
          <div className="size-11 rounded-full border border-solid border-current flex flex-col items-center justify-center">
            <span className="text-[6.5px] leading-none font-black">
              {stamp.postmarkCity || 'QUANTMAIL'}
            </span>
            <span className="text-[7.5px] font-extrabold my-0.5">★ 2026 ★</span>
            <span className="text-[5.5px] leading-none tracking-tight">ENCRYPTED</span>
          </div>
        </div>

        {/* 4 Wavy Ink Cancellation Lines */}
        <svg
          viewBox="0 0 64 36"
          className="w-14 h-8"
          fill="none"
          stroke={postmarkColor}
          strokeWidth="1.2"
        >
          <path d="M0 8 Q 16 0, 32 8 T 64 8" />
          <path d="M0 16 Q 16 8, 32 16 T 64 16" />
          <path d="M0 24 Q 16 16, 32 24 T 64 24" />
          <path d="M0 32 Q 16 24, 32 32 T 64 32" />
        </svg>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. REAL PERFORATED POSTAGE STAMP (Serrated Scalloped Teeth)  */}
      {/* ------------------------------------------------------------- */}
      <div
        className="relative w-16 h-20 p-1 bg-white dark:bg-zinc-800 shadow-md border border-zinc-400/60 dark:border-amber-500/40 rounded-[2px]"
        style={{
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}
      >
        {/* Scalloped teeth simulated borders */}
        <div className="w-full h-full border border-dashed border-zinc-400/80 dark:border-amber-400/50 p-1 flex flex-col justify-between items-center bg-[#FAF6F0] dark:bg-zinc-900 overflow-hidden">
          {/* Stamp Top Kicker */}
          <div className="w-full flex items-center justify-between text-[6.5px] font-black uppercase tracking-wider text-zinc-600 dark:text-amber-300">
            <span>POST</span>
            <span>{stamp.value}</span>
          </div>

          {/* Stamp Center Graphic */}
          <div className="my-auto flex flex-col items-center justify-center">
            {stamp.customImageUrl ? (
              <img
                src={stamp.customImageUrl}
                alt="Postage stamp"
                className="size-8 object-cover rounded-[1px] shadow-inner"
              />
            ) : stamp.type === 'botanical-flower' ? (
              <span className="text-xl leading-none">🌸</span>
            ) : stamp.type === 'travel-scenic' ? (
              <span className="text-xl leading-none">🗻</span>
            ) : (
              // Default Quanty Mascot Stamp Emblem
              <div className="size-8 rounded-sm bg-gradient-to-br from-[#FF9900] to-[#E52E14] flex items-center justify-center shadow-inner text-white font-black text-xs">
                M
              </div>
            )}
          </div>

          {/* Stamp Bottom Text */}
          <span className="text-[6px] font-bold tracking-widest text-zinc-500 dark:text-amber-400/80 uppercase">
            QUANT TRINITY
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * World-Class 3D Flippable Vintage Postcard Canvas
 */
export function PostcardCanvas({
  template,
  message = '',
  recipientName = 'Dear Friend',
  recipientEmail = 'recipient@quantmail.in',
  senderName = 'Kundan',
  senderEmail = 'kundan@quantmail.in',
  dateString = '21 Aug 2026',
  locationString = 'Tokyo / New Delhi',
  editable = false,
  onMessageChange,
  className = '',
  initialFlipped = false,
  allowFlip = true,
}: PostcardCanvasProps) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);
  const isDark = template.paperTexture === 'obsidian-matte';

  // Paper Texture Styling
  const paperStyles: Record<string, { bg: string; text: string; border: string; ink: string }> = {
    'vintage-parchment': {
      bg: 'bg-[#F4ECE1] shadow-[inset_0_0_60px_rgba(180,140,90,0.22)]',
      text: 'text-[#2C1D11]',
      border: 'border-[#D1BFA8]',
      ink: '#2C1D11',
    },
    'antique-map': {
      bg: 'bg-[#F6EFE6] shadow-[inset_0_0_70px_rgba(160,120,70,0.25)]',
      text: 'text-[#281B10]',
      border: 'border-[#CCB89E]',
      ink: '#281B10',
    },
    'botanical-linen': {
      bg: 'bg-[#FAF6F0] shadow-[inset_0_0_50px_rgba(200,180,160,0.18)]',
      text: 'text-[#2D2824]',
      border: 'border-[#D9CFC4]',
      ink: '#2D2824',
    },
    'obsidian-matte': {
      bg: 'bg-[#121316] shadow-[inset_0_0_50px_rgba(0,0,0,0.85)]',
      text: 'text-[#F3F4F6]',
      border: 'border-amber-500/40',
      ink: '#F59E0B',
    },
    'clean-ivory': {
      bg: 'bg-[#FCFAF7] shadow-[inset_0_0_40px_rgba(0,0,0,0.06)]',
      text: 'text-[#1F1D1A]',
      border: 'border-zinc-300',
      ink: '#1F1D1A',
    },
  };

  const currentTheme = paperStyles[template.paperTexture] || paperStyles['vintage-parchment'];

  // Font family mappings
  const fontClass =
    template.fontFamily === 'typewriter'
      ? 'font-mono tracking-tight'
      : template.fontFamily === 'serif'
        ? 'font-serif'
        : template.fontFamily === 'handwriting'
          ? 'italic font-sans'
          : 'font-sans';

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      {/* ------------------------------------------------------------- */}
      {/* 3D PERSPECTIVE WRAPPER                                         */}
      {/* ------------------------------------------------------------- */}
      <div
        className="relative w-full max-w-2xl aspect-[1.58/1] min-h-[360px] select-none rounded-xl"
        style={{ perspective: 1400 }}
      >
        <motion.div
          className="relative w-full h-full rounded-xl transition-all duration-700"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.65, ease: [0.34, 1.3, 0.64, 1] }}
        >
          {/* ========================================================= */}
          {/* SIDE A: BACK (CORRESPONDENCE & POSTAGE DETAILS)           */}
          {/* ========================================================= */}
          <div
            className={`absolute inset-0 w-full h-full rounded-xl border-2 ${currentTheme.border} ${currentTheme.bg} p-6 sm:p-8 flex flex-col justify-between shadow-2xl overflow-hidden`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* Antique Map Background Watermark */}
            {template.paperTexture === 'antique-map' && (
              <div
                className="absolute inset-0 pointer-events-none opacity-15 bg-repeat"
                style={{
                  backgroundImage: `radial-gradient(#8B5A2B 0.75px, transparent 0.75px), radial-gradient(#8B5A2B 0.75px, #F6EFE6 0.75px)`,
                  backgroundSize: '30px 30px',
                  backgroundPosition: '0 0, 15px 15px',
                }}
              />
            )}

            {/* Victorian Corner Filigrees */}
            {template.hasFiligree && (
              <>
                <FiligreeCorner
                  className={`absolute top-2 left-2 ${isDark ? 'text-amber-400' : 'text-[#8C6D52]'}`}
                />
                <FiligreeCorner
                  className={`absolute top-2 right-2 rotate-90 ${isDark ? 'text-amber-400' : 'text-[#8C6D52]'}`}
                />
                <FiligreeCorner
                  className={`absolute bottom-2 left-2 -rotate-90 ${isDark ? 'text-amber-400' : 'text-[#8C6D52]'}`}
                />
                <FiligreeCorner
                  className={`absolute bottom-2 right-2 rotate-180 ${isDark ? 'text-amber-400' : 'text-[#8C6D52]'}`}
                />
              </>
            )}

            {/* Vintage Postcard Engraved Top Title */}
            <div
              className="relative z-10 flex items-center justify-between border-b pb-2.5 mb-3"
              style={{ borderColor: isDark ? 'rgba(245,158,11,0.25)' : 'rgba(140,109,82,0.3)' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-2xl sm:text-3xl font-serif tracking-widest font-black uppercase drop-shadow-sm"
                  style={{
                    fontFamily: '"Cinzel", "Georgia", "Times New Roman", serif',
                    color: isDark ? '#F59E0B' : '#3E2715',
                  }}
                >
                  Post Card
                </span>
                <span className="hidden sm:inline-block text-[9px] font-mono tracking-widest uppercase text-zinc-500 dark:text-zinc-400">
                  · QuantMail Postal Transmission ·
                </span>
              </div>

              {/* Date & Location Stamp Header */}
              <div className="text-right text-[10px] font-mono text-zinc-600 dark:text-zinc-400">
                <span>{locationString}</span>
                <span className="mx-1.5">|</span>
                <span className="font-bold">{dateString}</span>
              </div>
            </div>

            {/* Main Postcard Body Split (Left = Message, Right = Recipient & Stamp) */}
            <div className="relative z-10 flex-1 grid grid-cols-12 gap-5 sm:gap-6 min-h-0">
              {/* LEFT SIDE: SENDER'S LETTER MESSAGE */}
              <div className="col-span-7 flex flex-col justify-between pr-2">
                {editable ? (
                  <textarea
                    value={message}
                    onChange={(e) => onMessageChange?.(e.target.value)}
                    placeholder="Write your heartfelt postcard message here…"
                    className={`w-full flex-1 bg-transparent resize-none focus:outline-none ${fontClass} text-xs sm:text-sm leading-relaxed ${currentTheme.text}`}
                    style={{ color: template.inkColor }}
                  />
                ) : (
                  <div
                    className={`flex-1 overflow-y-auto whitespace-pre-wrap ${fontClass} text-xs sm:text-sm leading-relaxed pr-1`}
                    style={{ color: template.inkColor }}
                  >
                    {message || 'No message provided.'}
                  </div>
                )}

                {/* Sender Signature Sign-off */}
                <div
                  className="pt-2 flex items-baseline justify-between text-[11px] font-mono opacity-80"
                  style={{ color: template.inkColor }}
                >
                  <span className="italic font-serif">Yours faithfully,</span>
                  <span className="font-bold">{senderName || senderEmail}</span>
                </div>
              </div>

              {/* CENTER VERTICAL SEPARATION LINE */}
              <div
                className="absolute left-[58%] top-0 bottom-0 w-[1px]"
                style={{
                  background: isDark
                    ? 'linear-gradient(to bottom, transparent, rgba(245,158,11,0.4), transparent)'
                    : 'linear-gradient(to bottom, transparent, rgba(140,109,82,0.45), transparent)',
                }}
              />

              {/* RIGHT SIDE: POSTAGE STAMP & ADDRESS LINES */}
              <div className="col-span-5 pl-3 sm:pl-4 flex flex-col justify-between">
                {/* Stamp placed top right */}
                <div className="flex justify-end pr-1">
                  <VintagePostageStamp stamp={template.stamp} isDark={isDark} />
                </div>

                {/* Classic Dotted Delivery Lines */}
                <div className="space-y-3 pb-1">
                  {/* Recipient Name Line */}
                  <div className="border-b border-dashed border-zinc-400 dark:border-zinc-700 pb-0.5">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mr-2">
                      To:
                    </span>
                    <strong className="text-xs sm:text-[13px] font-serif text-zinc-800 dark:text-zinc-100">
                      {recipientName}
                    </strong>
                  </div>

                  {/* Recipient Address / Email Line */}
                  <div className="border-b border-dashed border-zinc-400 dark:border-zinc-700 pb-0.5">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mr-2">
                      Addr:
                    </span>
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                      {recipientEmail}
                    </span>
                  </div>

                  {/* Encrypted Transit Hash Line */}
                  <div className="border-b border-dashed border-zinc-400 dark:border-zinc-700 pb-0.5 flex items-center justify-between text-[8px] font-mono text-zinc-500 dark:text-zinc-400">
                    <span>SEAL: QM-SEC-2026-TLS</span>
                    <span>✓ E2EE VERIFIED</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom PNG Stickers Layer (Rendered over the card) */}
            {template.stickers &&
              template.stickers.map((sticker) => (
                <div
                  key={sticker.id}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${sticker.x}%`,
                    top: `${sticker.y}%`,
                    transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})`,
                  }}
                >
                  <img
                    src={sticker.src}
                    alt={sticker.alt || 'Postcard sticker'}
                    className="max-w-[72px] max-h-[72px] object-contain drop-shadow-md"
                  />
                </div>
              ))}
          </div>

          {/* ========================================================= */}
          {/* SIDE B: FRONT (SCENIC ART / CUSTOM PHOTO / COVER ART)     */}
          {/* ========================================================= */}
          <div
            className={`absolute inset-0 w-full h-full rounded-xl border-2 ${currentTheme.border} ${currentTheme.bg} p-4 sm:p-5 flex flex-col justify-between shadow-2xl overflow-hidden`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            {template.frontImageUrl ? (
              <div className="relative w-full h-full rounded-lg overflow-hidden border border-black/10 shadow-inner group">
                <img
                  src={template.frontImageUrl}
                  alt="Postcard Cover Art"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-5 text-white">
                  <span
                    className="text-2xl sm:text-3xl font-serif font-black tracking-wide drop-shadow-lg italic"
                    style={{ fontFamily: '"Playfair Display", serif' }}
                  >
                    Greetings from {locationString}
                  </span>
                  <p className="text-[11px] font-mono tracking-wider opacity-90 text-amber-200">
                    QuantMail Handcrafted Postal Edition
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full rounded-lg border-2 border-dashed border-zinc-400/70 dark:border-zinc-700 flex flex-col items-center justify-center p-6 text-center">
                <span className="text-4xl sm:text-5xl mb-3">💌</span>
                <h3 className="text-lg sm:text-xl font-serif font-bold text-zinc-800 dark:text-zinc-100">
                  {template.name}
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mt-1">
                  {template.description}
                </p>
                <div className="mt-4 px-3 py-1 bg-amber-500/15 border border-amber-500/30 rounded-full text-xs font-mono text-amber-700 dark:text-amber-300 font-semibold">
                  Tap "Flip Card" below to write message
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3D FLIP BUTTON CONTROLLER                                     */}
      {/* ------------------------------------------------------------- */}
      {allowFlip && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsFlipped((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-zinc-900/90 dark:bg-zinc-800 text-amber-400 hover:text-white border border-amber-500/30 hover:border-amber-400 shadow-md transition-all active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3.5 stroke-[2.2]"
              fill="none"
              stroke="currentColor"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{isFlipped ? 'View Message Side' : 'View Cover Picture'} (3D Flip)</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default PostcardCanvas;
