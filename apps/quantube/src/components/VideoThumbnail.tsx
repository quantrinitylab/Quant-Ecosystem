// ============================================================================
// QuanTube - VideoThumbnail
// DC-P1-11(b): never render a dead blank tile. While the image is loading a
// shimmer skeleton shows; when there is genuinely no usable thumbnail (empty
// URL or load error) an honest empty state renders instead.
// ============================================================================

import React, { useState } from 'react';

export type ThumbnailStatus = 'loading' | 'loaded' | 'empty';

export interface VideoThumbnailProps {
  /** Thumbnail URL. Falsy/blank means "no thumbnail" -> honest empty state. */
  src?: string | null;
  alt: string;
  className?: string;
  /** Overlay badges (LIVE / duration / SAMPLE / resolution) render on top. */
  children?: React.ReactNode;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({
  src,
  alt,
  className = '',
  children,
}) => {
  const effectiveSrc = src && src.trim().length > 0 ? src : null;
  const [status, setStatus] = useState<ThumbnailStatus>(effectiveSrc ? 'loading' : 'empty');

  return (
    <div
      className={`relative aspect-video overflow-hidden bg-[var(--surface-elevated,#1a1a24)] ${className}`}
      data-testid="video-thumbnail"
    >
      {status === 'loading' && (
        <div
          className="absolute inset-0 bg-[var(--surface-elevated,#1a1a24)] animate-shimmer"
          aria-hidden="true"
        />
      )}
      {effectiveSrc && status !== 'empty' && (
        <img
          src={effectiveSrc}
          alt={alt}
          loading="lazy"
          draggable={false}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('empty')}
        />
      )}
      {status === 'empty' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[var(--quant-muted-foreground,#a1a1aa)]"
          role="img"
          aria-label={`${alt} — no preview available`}
          data-testid="video-thumbnail-empty"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="M10.5 9.8v4.4L14.5 12l-4-2.2z" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-xs font-medium">No preview available</span>
        </div>
      )}
      {children}
    </div>
  );
};

export default VideoThumbnail;
