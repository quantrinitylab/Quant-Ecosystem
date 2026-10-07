'use client';
// ============================================================================
// QuantLive - Captions Component
// ============================================================================

import React, { useEffect, useRef } from 'react';
import type { QuantLiveCaptionsProps } from './types';

export const QuantLiveCaptions: React.FC<QuantLiveCaptionsProps> = ({
  captions,
  maxVisible = 50,
  className = '',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captions]);

  const visibleCaptions = captions.slice(-maxVisible);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Conversation captions"
      className={`overflow-y-auto max-h-64 flex flex-col gap-2 p-2 ${className}`}
    >
      {visibleCaptions.map((caption, index) => {
        const opacity = Math.max(0.4, (index + 1) / visibleCaptions.length);
        const isUser = caption.speaker === 'user';

        return (
          <div
            key={caption.id}
            className={`max-w-[80%] px-3 py-2 rounded-lg text-sm transition-opacity duration-300 motion-reduce:transition-none ${
              isUser ? 'self-end bg-blue-100 text-blue-900' : 'self-start bg-gray-100 text-gray-900'
            } ${!caption.isFinal ? 'italic opacity-70' : ''}`}
            style={{ opacity: caption.isFinal ? opacity : undefined }}
          >
            {caption.text}
          </div>
        );
      })}
    </div>
  );
};
