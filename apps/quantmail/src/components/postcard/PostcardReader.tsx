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

  return (
    <div className={`relative flex flex-col items-center w-full ${className}`}>
      {/* Top Toggle Toolbar */}
      <div className="w-full flex items-center justify-between pb-4 border-b border-zinc-800 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-lg">💌</span>
          <span className="text-xs font-serif font-bold text-amber-400 uppercase tracking-widest">
            {payload.template.name}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            AUTHENTIC POSTCARD
          </span>
        </div>

        {/* View Mode Switch */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setViewMode('postcard')}
            className={`px-3 py-1 rounded-md font-semibold transition-all ${
              viewMode === 'postcard'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Postcard View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('standard')}
            className={`px-3 py-1 rounded-md font-semibold transition-all ${
              viewMode === 'standard'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
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
        <div className="w-full text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
          {email.bodyHtml ? (
            <div dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
          ) : (
            email.bodyText || email.snippet || 'No message content.'
          )}
        </div>
      )}
    </div>
  );
}

export default PostcardReader;
