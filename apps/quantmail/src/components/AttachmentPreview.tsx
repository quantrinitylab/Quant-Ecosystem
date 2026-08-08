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

  const isImage = (mimeType: string) =>
    mimeType.startsWith('image/');

  const isPDF = (mimeType: string) =>
    mimeType === 'application/pdf';

  const getIcon = (mimeType: string): string => {
    if (isImage(mimeType)) return '🖼️';
    if (isPDF(mimeType)) return '📄';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('video')) return '🎬';
    return '📎';
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="attachment-preview-container">
      <p className="attachment-preview-label">
        📎 {attachments.length} attachment{attachments.length > 1 ? 's' : ''}
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
                <span className="attachment-preview-icon">{getIcon(att.mimeType)}</span>
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
