// ============================================================================
// QuantChat - Link Preview Component
// Card showing extracted link metadata (image, title, description, domain)
// ============================================================================

import React from 'react';
import type { LinkPreview as LinkPreviewData } from '../services/link-preview.service';

export interface LinkPreviewProps {
  preview: LinkPreviewData;
  onClose?: () => void;
  compact?: boolean;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ preview, onClose, compact = false }) => {
  const handleClick = () => {
    window.open(preview.url, '_blank', 'noopener,noreferrer');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  if (compact) {
    return (
      <div
        className="link-preview link-preview--compact"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="link"
        tabIndex={0}
        aria-label={`Link to ${preview.title}`}
      >
        {preview.favicon && (
          <img
            src={preview.favicon}
            alt=""
            className="link-preview__favicon"
            width={16}
            height={16}
          />
        )}
        <span className="link-preview__title">{preview.title}</span>
        <span className="link-preview__site">{preview.siteName}</span>
        {onClose && (
          <button
            className="link-preview__close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Remove preview"
          >
            &#10005;
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="link-preview"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
      aria-label={`Link to ${preview.title}`}
    >
      {onClose && (
        <button
          className="link-preview__close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Remove preview"
        >
          &#10005;
        </button>
      )}

      {preview.imageUrl && (
        <div className="link-preview__image-container">
          <img src={preview.imageUrl} alt={preview.title} className="link-preview__image" />
        </div>
      )}

      <div className="link-preview__content">
        <div className="link-preview__header">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="link-preview__favicon"
              width={16}
              height={16}
            />
          )}
          <span className="link-preview__site">{preview.siteName}</span>
          <span className="link-preview__type">{preview.type}</span>
        </div>

        <h4 className="link-preview__title">{preview.title}</h4>

        {preview.description && <p className="link-preview__description">{preview.description}</p>}

        <span className="link-preview__url">{preview.url}</span>
      </div>
    </div>
  );
};

export default LinkPreview;
