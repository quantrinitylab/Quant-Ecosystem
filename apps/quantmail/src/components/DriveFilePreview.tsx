'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { IconDownload, IconShare, IconTrash, MimeTypeIcon } from './icons';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  thumbnailUrl?: string;
  modifiedAt?: string;
  sharedWith?: string[];
}

interface DriveFilePreviewProps {
  file: DriveFile;
  onClose: () => void;
  onDownload: (fileId: string) => void;
  onShare: (fileId: string) => void;
  onDelete: (fileId: string) => void;
}

/**
 * Drive File Preview Panel — shows file details, preview, and actions.
 * Google Drive opens a full-page viewer. We show an inline split-pane preview
 * so you don't lose context of your file list.
 */
export function DriveFilePreview({
  file,
  onClose,
  onDownload,
  onShare,
  onDelete,
}: DriveFilePreviewProps) {
  const isImage = file.mimeType.startsWith('image/');
  const isPDF = file.mimeType === 'application/pdf';
  const isText = file.mimeType.startsWith('text/') || file.mimeType.includes('json');

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      className="drive-preview-panel"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <header className="drive-preview-header">
        <h3 className="drive-preview-title">{file.name}</h3>
        <button
          type="button"
          className="drive-preview-close"
          onClick={onClose}
          aria-label="Close preview"
        >
          ×
        </button>
      </header>

      <div className="drive-preview-content">
        {isImage && file.url && (
          <div className="drive-preview-image">
            <img src={file.url} alt={file.name} />
          </div>
        )}
        {isPDF && file.url && (
          <div className="drive-preview-pdf">
            <iframe src={file.url} title={file.name} />
          </div>
        )}
        {!isImage && !isPDF && (
          <div className="drive-preview-placeholder">
            <span className="drive-preview-icon">
              <MimeTypeIcon mimeType={file.mimeType} size={40} tinted={false} />
            </span>
            <p>Preview not available for this file type</p>
          </div>
        )}
      </div>

      <div className="drive-preview-meta">
        <div className="drive-meta-row">
          <span className="drive-meta-label">Size</span>
          <span className="drive-meta-value">{formatSize(file.size)}</span>
        </div>
        <div className="drive-meta-row">
          <span className="drive-meta-label">Type</span>
          <span className="drive-meta-value">{file.mimeType}</span>
        </div>
        {file.modifiedAt && (
          <div className="drive-meta-row">
            <span className="drive-meta-label">Modified</span>
            <span className="drive-meta-value">
              {new Date(file.modifiedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
        {file.sharedWith && file.sharedWith.length > 0 && (
          <div className="drive-meta-row">
            <span className="drive-meta-label">Shared with</span>
            <span className="drive-meta-value">{file.sharedWith.length} people</span>
          </div>
        )}
      </div>

      <div className="drive-preview-actions">
        <button
          type="button"
          className="drive-action-btn drive-action-primary"
          onClick={() => onDownload(file.id)}
        >
          <IconDownload size={14} />
          Download
        </button>
        <button type="button" className="drive-action-btn" onClick={() => onShare(file.id)}>
          <IconShare size={14} />
          Share
        </button>
        <button
          type="button"
          className="drive-action-btn drive-action-danger"
          onClick={() => onDelete(file.id)}
        >
          <IconTrash size={14} />
          Delete
        </button>
      </div>
    </motion.div>
  );
}
