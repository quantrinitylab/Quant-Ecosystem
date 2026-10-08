'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { browserApiRequest } from '../services/browser-api-request';
import { DriveFilePreview } from './DriveFilePreview';

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  /**
   * QM-M39-010: the AttachmentService row id (e.g. "att_<uuid>") when the
   * backend can actually read this attachment's bytes. Null for inbound
   * metadata-only attachments — those are never offered a Save button.
   */
  attachmentId?: string | null;
}

interface SavedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedAt?: string;
}

type SaveState =
  | { status: 'saving' }
  | { status: 'saved'; file: SavedDriveFile; deduplicated: boolean }
  | { status: 'error'; message: string };

interface AttachmentPreviewProps {
  attachments: Attachment[];
  /** Mail message id — passed through to the save endpoint for provenance. */
  messageId?: string;
  /** Returns the user to the mail context (scrolls the message into view). */
  onBackToMail?: () => void;
}

/*
 * Zoom bounds mirror the pinch config documented in `src/mobile/gestures.ts`
 * (PinchConfig: 0.5 – 3.0). The gesture *service* there only models gestures;
 * this lightbox does the real DOM-level handling: two-finger pinch, wheel
 * zoom, and double-tap toggle.
 */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Inline attachment preview with thumbnails.
 * Gmail shows attachment chips at the bottom of each email.
 * We show a visual gallery with type icons and preview capability.
 */
export function AttachmentPreview({
  attachments,
  messageId,
  onBackToMail,
}: AttachmentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // QM-M39-010: per-attachment Drive save state, keyed by the rendered id.
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  // QM-M39-010: the saved Drive file currently open in the Drive preview.
  const [previewFile, setPreviewFile] = useState<SavedDriveFile | null>(null);
  /*
   * Refs (not state) for the in-progress gesture: updated dozens of times per
   * second during a pinch, and we don't want a re-render per touchmove — the
   * transform is applied directly to the image element for 60fps.
   */
  const imgRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef<{
    startDist: number;
    startZoom: number;
    lastX: number;
    lastY: number;
    panX: number;
    panY: number;
    pinch: boolean;
  } | null>(null);

  const applyTransform = useCallback((z: number, x: number, y: number) => {
    const img = imgRef.current;
    if (img) {
      img.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    }
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    gestureRef.current = null;
    const img = imgRef.current;
    if (img) img.style.transform = '';
  }, []);

  // Zoom resets whenever a different image is previewed or the lightbox closes.
  useEffect(() => {
    resetZoom();
  }, [previewUrl, resetZoom]);

  const distance = (a: React.Touch, b: React.Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      gestureRef.current = {
        startDist: distance(a, b),
        startZoom: zoom,
        lastX: 0,
        lastY: 0,
        panX: pan.x,
        panY: pan.y,
        pinch: true,
      };
    } else if (e.touches.length === 1 && zoom > 1) {
      // One-finger pan while zoomed in.
      const t = e.touches[0];
      gestureRef.current = {
        startDist: 0,
        startZoom: zoom,
        lastX: t.clientX,
        lastY: t.clientY,
        panX: pan.x,
        panY: pan.y,
        pinch: false,
      };
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    if (g.pinch && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = distance(a, b);
      if (g.startDist > 0 && d > 0) {
        const z = clampZoom((g.startZoom * d) / g.startDist);
        g.startZoom = z; // rebase so the gesture stays smooth across moves
        g.startDist = d;
        setZoom(z);
        applyTransform(z, g.panX, g.panY);
      }
    } else if (!g.pinch && e.touches.length === 1 && zoom > 1) {
      e.preventDefault();
      const t = e.touches[0];
      const x = g.panX + (t.clientX - g.lastX);
      const y = g.panY + (t.clientY - g.lastY);
      g.panX = x;
      g.panY = y;
      g.lastX = t.clientX;
      g.lastY = t.clientY;
      setPan({ x, y });
      applyTransform(zoom, x, y);
    }
  }, [zoom, applyTransform]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) gestureRef.current = null;
    else if (e.touches.length === 1) {
      // Pinch released into a pan: re-anchor the single finger.
      const t = e.touches[0];
      const g = gestureRef.current;
      if (g) {
        gestureRef.current = { ...g, pinch: false, lastX: t.clientX, lastY: t.clientY };
      }
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const next = clampZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      const g = gestureRef.current;
      applyTransform(next, g?.panX ?? pan.x, g?.panY ?? pan.y);
      return next;
    });
  }, [applyTransform, pan]);

  const handleDoubleClick = useCallback(() => {
    const next = zoom > 1.25 ? 1 : 2;
    setZoom(next);
    setPan({ x: 0, y: 0 });
    applyTransform(next, 0, 0);
  }, [zoom, applyTransform]);

  /*
   * QM-M39-010: "Save to Drive" on a mail attachment. The backend reads the
   * real bytes server-side, hashes them, and either returns the existing
   * Drive file (deduplicated — no second Drive row) or creates the canonical
   * one. Errors are reported verbatim from the backend, never invented.
   */
  const handleSaveToDrive = useCallback(
    async (att: Attachment) => {
      if (!att.attachmentId) return;
      setSaveStates((prev) => ({ ...prev, [att.id]: { status: 'saving' } }));
      try {
        const res = await browserApiRequest('/api/drive/save-attachment', {
          method: 'POST',
          body: JSON.stringify({ attachmentId: att.attachmentId, messageId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            data?.error?.message || data?.message || `Save failed (status ${res.status})`;
          setSaveStates((prev) => ({ ...prev, [att.id]: { status: 'error', message } }));
          return;
        }
        setSaveStates((prev) => ({
          ...prev,
          [att.id]: { status: 'saved', file: data.file, deduplicated: Boolean(data.deduplicated) },
        }));
      } catch (err) {
        setSaveStates((prev) => ({
          ...prev,
          [
            att.id
          ]: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Save failed',
          },
        }));
      }
    },
    [messageId],
  );

  const handleDriveDownload = useCallback(async (fileId: string, fileName?: string) => {
    try {
      const res = await browserApiRequest(`/api/drive/files/${fileId}/download`);
      if (!res.ok) throw new Error(`Download failed (status ${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      if (fileName) anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      // The Drive page carries full download error UX; this modal is a
      // preview surface, so a failure simply does nothing here rather than
      // showing an invented error state.
    }
  }, []);

  const handleDriveShare = useCallback(() => {
    // Sharing UI lives on the Drive page — open it so the share action is
    // real, not a stubbed dialog.
    window.open('/drive', '_blank', 'noopener,noreferrer');
  }, []);

  const handleDriveDelete = useCallback(async (fileId: string) => {
    const res = await browserApiRequest(`/api/drive/files/${fileId}`, { method: 'DELETE' });
    if (!res.ok) return;
    setPreviewFile(null);
    setSaveStates((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const state = next[key];
        if (state.status === 'saved' && state.file.id === fileId) delete next[key];
      }
      return next;
    });
  }, []);

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
        {attachments.map((att) => {
          const saveState = saveStates[att.id];
          // The button is offered only when the backend can actually read the
          // attachment's bytes (AttachmentService row id). Inbound
          // metadata-only attachments get no button — a button that could
          // never work would be a fake control.
          const canSaveToDrive = Boolean(att.attachmentId);
          return (
            <div key={att.id} className="attachment-preview-cell">
              <button
                type="button"
                className="attachment-preview-item"
                onClick={() => att.url && setPreviewUrl(att.url)}
                title={att.filename}
              >
                <div className="attachment-preview-thumb">
                  {isImage(att.mimeType) && att.url ? (
                    <img src={att.url} alt={att.filename} className="attachment-preview-img" loading="lazy" decoding="async" />
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
              {canSaveToDrive && saveState?.status !== 'saved' && (
                <div className="attachment-save-row">
                  <button
                    type="button"
                    className="attachment-save-btn"
                    onClick={() => handleSaveToDrive(att)}
                    disabled={saveState?.status === 'saving'}
                  >
                    {saveState?.status === 'saving' ? 'Saving…' : 'Save to Drive'}
                  </button>
                  {saveState?.status === 'error' && (
                    <p className="attachment-save-error" role="alert">
                      {saveState.message}
                    </p>
                  )}
                </div>
              )}
              {saveState?.status === 'saved' && (
                <div className="attachment-save-result">
                  <p className="attachment-save-result-text">
                    {saveState.deduplicated
                      ? 'Already in Drive — no duplicate was created.'
                      : 'Saved to Drive.'}
                  </p>
                  <div className="attachment-save-result-actions">
                    <button
                      type="button"
                      className="attachment-save-result-btn"
                      onClick={() => setPreviewFile(saveState.file)}
                    >
                      Preview
                    </button>
                    {onBackToMail && (
                      <button
                        type="button"
                        className="attachment-save-result-btn"
                        onClick={onBackToMail}
                      >
                        Back to email
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Full-size preview modal with pinch-to-zoom */}
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
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              style={{ touchAction: 'none', overflow: 'hidden' }}
            >
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Attachment preview"
                draggable={false}
                decoding="async"
                onDoubleClick={handleDoubleClick}
                style={{
                  maxWidth: '100%',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  cursor: zoom > 1 ? 'grab' : 'zoom-in',
                  transition: 'transform 80ms ease-out',
                }}
              />
              <button
                type="button"
                className="attachment-lightbox-close"
                onClick={() => setPreviewUrl(null)}
                aria-label="Close preview"
              >
                ×
              </button>
              {/* Zoom controls: discoverability for mouse users who won't pinch */}
              <div
                className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border border-[#282C35] bg-[#16181D]/95 p-1 shadow-xl"
                role="group"
                aria-label="Image zoom"
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = clampZoom(zoom / 1.25);
                    setZoom(next);
                    applyTransform(next, pan.x, pan.y);
                  }}
                  disabled={zoom <= MIN_ZOOM}
                  className="grid min-h-[36px] min-w-[36px] place-items-center rounded-full text-lg text-[#F5F5F5] transition-colors hover:bg-[#282C35] disabled:opacity-30"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    applyTransform(1, 0, 0);
                  }}
                  className="min-w-[44px] rounded-full px-1 text-[11px] font-semibold text-[#A1A4AC] transition-colors hover:text-white"
                  aria-label="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = clampZoom(zoom * 1.25);
                    setZoom(next);
                    applyTransform(next, pan.x, pan.y);
                  }}
                  disabled={zoom >= MAX_ZOOM}
                  className="grid min-h-[36px] min-w-[36px] place-items-center rounded-full text-lg text-[#F5F5F5] transition-colors hover:bg-[#282C35] disabled:opacity-30"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
              {zoom > 1 && (
                <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/80">
                  Drag to pan · double-tap to reset
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QM-M39-010: preview the saved file through the Drive preview system.
          Uses the existing DriveFilePreview surface on main (QM-M39-004's
          capability-aware preview is a separate, unmerged PR — this modal
          picks it up automatically once that lands). */}
      <AnimatePresence>
        {previewFile && (
          <motion.div
            className="attachment-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewFile(null)}
          >
            <motion.div
              className="attachment-lightbox-content"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <DriveFilePreview
                file={{
                  id: previewFile.id,
                  name: previewFile.name,
                  mimeType: previewFile.mimeType,
                  size: previewFile.size,
                  url: `/api/drive/files/${previewFile.id}/download`,
                  modifiedAt: previewFile.modifiedAt,
                }}
                onClose={() => setPreviewFile(null)}
                onDownload={(id) => handleDriveDownload(id, previewFile.name)}
                onShare={handleDriveShare}
                onDelete={handleDriveDelete}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
