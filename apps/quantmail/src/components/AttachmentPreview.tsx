'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
}

/**
 * Inline attachment preview with thumbnails.
 * Gmail shows attachment chips at the bottom of each email.
 * We show a visual gallery with type icons and preview capability.
 */
export function AttachmentPreview({ attachments }: AttachmentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  const isPDF = (mimeType: string) => mimeType === 'application/pdf';

  const renderAttachmentIcon = (mimeType: string) => {
    if (isPDF(mimeType)) {
      return (
        <svg
          className="size-5 text-rose-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 12h4" />
          <path d="M10 16h4" />
        </svg>
      );
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return (
        <svg
          className="size-5 text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M9 3v18" />
          <path d="M15 3v18" />
        </svg>
      );
    }
    if (mimeType.includes('zip') || mimeType.includes('archive')) {
      return (
        <svg
          className="size-5 text-[#FF8C42]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    }
    if (mimeType.includes('audio')) {
      return (
        <svg
          className="size-5 text-purple-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    }
    if (mimeType.includes('video')) {
      return (
        <svg
          className="size-5 text-blue-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m22 8-6 4 6 4V8Z" />
          <rect width="14" height="12" x="2" y="6" rx="2" />
        </svg>
      );
    }
    return (
      <svg
        className="size-5 text-[#A1A4AC]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    );
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="attachment-preview-container">
      <p className="attachment-preview-label flex items-center gap-1.5">
        <svg
          className="size-3.5 text-[#FF8C42]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        <span>
          {attachments.length} attachment{attachments.length > 1 ? 's' : ''}
        </span>
      </p>
      <div className="attachment-preview-grid">
        {attachments.map((att) => (
          <button
            key={att.id}
            type="button"
            className="attachment-preview-item"
            onClick={() => att.url && setPreviewUrl(att.url)}
            title={att.filename}
          >
            <div className="attachment-preview-thumb">
              {isImage(att.mimeType) && att.url ? (
                <img src={att.url} alt={att.filename} className="attachment-preview-img" />
              ) : (
                <span className="attachment-preview-icon">
                  {renderAttachmentIcon(att.mimeType)}
                </span>
              )}
            </div>
            <div className="attachment-preview-info">
              <span className="attachment-preview-name">{att.filename}</span>
              <span className="attachment-preview-size">{formatSize(att.size)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Full-size preview modal */}
      <AnimatePresence>
        {previewUrl && (
          <motion.div
            className="attachment-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewUrl(null)}
          >
            <motion.div
              className="attachment-lightbox-content"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <img src={previewUrl} alt="Attachment preview" />
              <button
                type="button"
                className="attachment-lightbox-close"
                onClick={() => setPreviewUrl(null)}
                aria-label="Close preview"
              >
                ×
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
