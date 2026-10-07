'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PostcardCanvas } from './PostcardCanvas';
import {
  DEFAULT_VINTAGE_PRESETS,
  type PostcardTemplate,
  type PostcardPayload,
} from '../../types/postcard';
import type { Email } from '../../types';
import { useSafeEmailHtml } from '../../lib/safe-html';
import { IconMailHeart } from '../icons';

interface PostcardReaderProps {
  email: Email;
  className?: string;
}

/**
 * Extracts postcard payload from email body/headers or synthesizes an authentic vintage postcard for standard emails
 */
export function extractPostcardPayload(email: Email): PostcardPayload {
  // Check if email body contains embedded postcard JSON metadata
  if (email.bodyText?.includes('<!-- QUANTMAIL_POSTCARD:')) {
    try {
      const match = email.bodyText.match(/<!-- QUANTMAIL_POSTCARD:(.*?) -->/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }
    } catch {
      // fallback
    }
  }

  // Choose preset based on category or default to Wanderlust vintage
  const preset =
    email.category === 'promotions'
      ? DEFAULT_VINTAGE_PRESETS[4] // Obsidian luxury
      : email.category === 'social'
        ? DEFAULT_VINTAGE_PRESETS[2] // Botanical
        : DEFAULT_VINTAGE_PRESETS[0]; // Wanderlust Explorer

  return {
    template: preset,
    message: email.bodyText || email.snippet || '',
    recipientName: email.to?.[0]?.name || email.to?.[0]?.email || 'Dear Recipient',
    recipientEmail: email.to?.[0]?.email || 'recipient@quantmail.in',
    senderName: email.from?.name || email.from?.email || 'Sender',
    senderEmail: email.from?.email || 'sender@quantmail.in',
    dateString: email.receivedAt
      ? new Date(email.receivedAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '21 Aug 2026',
    locationString: 'QUANTUM TRANSIT',
  };
}

export function PostcardReader({ email, className = '' }: PostcardReaderProps) {
  const [isUnsealed, setIsUnsealed] = useState(true);
  const [viewMode, setViewMode] = useState<'postcard' | 'standard'>('postcard');
  const payload = extractPostcardPayload(email);
  // Standard view renders the real message body, so it needs the same DOMPurify
  // pass as the thread reader rather than the raw inbound markup.
  const safeHtml = useSafeEmailHtml(email.bodyHtml);

  return (
    <div className={`relative flex flex-col items-center w-full ${className}`}>
      {/* Top Toggle Toolbar */}
      <div className="w-full flex items-center justify-between pb-4 border-b border-[#282C35] mb-6">
        <div className="flex items-center gap-2">
          <span className="text-[#FF8C42]">
            <IconMailHeart size={17} />
          </span>
          <span className="text-xs font-serif font-bold text-[#FF8C42] uppercase tracking-widest">
            {payload.template.name}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF8C42]/15 text-[#FFB875] border border-[#FF8C42]/30">
            AUTHENTIC POSTCARD
          </span>
        </div>

        {/* View Mode Switch */}
        <div className="flex items-center gap-1 bg-[#111318] border border-[#282C35] p-0.5 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setViewMode('postcard')}
            className={`px-3 py-1 rounded-md font-semibold transition-all ${
              viewMode === 'postcard'
                ? 'bg-[#FF8C42] text-black shadow-sm'
                : 'text-[#A1A4AC] hover:text-white'
            }`}
          >
            Postcard View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('standard')}
            className={`px-3 py-1 rounded-md font-semibold transition-all ${
              viewMode === 'standard'
                ? 'bg-[#FF8C42] text-black shadow-sm'
                : 'text-[#A1A4AC] hover:text-white'
            }`}
          >
            Standard View
          </button>
        </div>
      </div>

      {/* Content Rendering */}
      {viewMode === 'postcard' ? (
        <div className="w-full flex flex-col items-center">
          <PostcardCanvas
            template={payload.template}
            message={payload.message}
            recipientName={payload.recipientName}
            recipientEmail={payload.recipientEmail}
            senderName={payload.senderName}
            senderEmail={payload.senderEmail}
            dateString={payload.dateString}
            locationString={payload.locationString}
            editable={false}
            allowFlip={true}
            className="w-full"
          />
        </div>
      ) : (
        <div className="w-full text-sm text-[#A1A4AC] leading-relaxed whitespace-pre-wrap font-sans">
          {safeHtml ? (
            <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
          ) : (
            email.bodyText || email.snippet || 'No message content.'
          )}
        </div>
      )}
    </div>
  );
}

export default PostcardReader;
