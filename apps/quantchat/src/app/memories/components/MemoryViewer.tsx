// ============================================================================
// QuantChat - MemoryViewer (Task 13.2)
// Full-media display for a selected memory with re-share / send / download
// actions, plus delete (which opens the 5s undo window upstream).
// ============================================================================
'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Memory } from '../../../hooks/useMemories';

interface MemoryViewerProps {
  memory: Memory | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  /** QC-F-450 — move the open item across the 'My Eyes Only' boundary. */
  onMoveToPrivate?: (id: string) => void;
  onMoveToPublic?: (id: string) => void;
}

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 32 };

export function MemoryViewer({
  memory,
  onClose,
  onDelete,
  onMoveToPrivate,
  onMoveToPublic,
}: MemoryViewerProps) {
  const handleShareToStories = useCallback(() => {
    if (!memory) return;
    // Re-share to stories surface (Task 13.2). Wired to the stories composer.
    window.dispatchEvent(
      new CustomEvent('quantchat:reshare-to-story', {
        detail: { memoryId: memory.id, mediaUrl: memory.mediaUrl },
      }),
    );
  }, [memory]);

  const handleSend = useCallback(() => {
    if (!memory) return;
    // Send to friends (Task 13.2). Wired to the share sheet.
    window.dispatchEvent(
      new CustomEvent('quantchat:send-memory', {
        detail: { memoryId: memory.id, mediaUrl: memory.mediaUrl },
      }),
    );
  }, [memory]);

  const handleDownload = useCallback(() => {
    if (!memory) return;
    const link = document.createElement('a');
    link.href = memory.mediaUrl;
    link.download = `quantchat-memory-${memory.id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [memory]);

  return (
    <AnimatePresence>
      {memory && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900"
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 24 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex-1 bg-black">
              {memory.mediaType === 'VIDEO' ? (
                <video
                  src={memory.mediaUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={memory.mediaUrl}
                  alt={memory.caption ?? 'Memory'}
                  className="max-h-[60vh] w-full object-contain"
                />
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white transition active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4">
              {memory.caption && <p className="text-sm text-white">{memory.caption}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span>{new Date(memory.createdAt).toLocaleString()}</span>
                {memory.location && <span>· 📍 {memory.location}</span>}
              </div>

              {/* QC-F-450: a private ('My Eyes Only') item is never re-shared
                  or sent from here — those paths carry the mediaUrl into
                  stories/messages, which have no passcode gate, so that
                  would leak straight out of the vault. Download stays: it
                  is the owner's own item on their own device. */}
              {memory.isPrivate ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 gap-2">
                    <ActionButton label="Download" icon="⬇️" onClick={handleDownload} />
                  </div>
                  <p className="text-xs text-gray-400">
                    This memory is in My Eyes Only — move it out of My Eyes Only before sharing
                    it.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <ActionButton label="Re-share" icon="🔁" onClick={handleShareToStories} />
                  <ActionButton label="Send" icon="📤" onClick={handleSend} />
                  <ActionButton label="Download" icon="⬇️" onClick={handleDownload} />
                </div>
              )}

              {/* QC-F-450 — vault move for the open item. Moving IN needs an
                  unlock (the page opens the passcode pad first when the
                  vault is locked); moving OUT always needs the unlock too
                  (the item is only visible while unlocked anyway). */}
              {memory.isPrivate
                ? onMoveToPublic && (
                    <button
                      type="button"
                      onClick={() => {
                        onMoveToPublic(memory.id);
                        onClose();
                      }}
                      className="mt-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
                    >
                      Move out of My Eyes Only
                    </button>
                  )
                : onMoveToPrivate && (
                    <button
                      type="button"
                      onClick={() => {
                        onMoveToPrivate(memory.id);
                        onClose();
                      }}
                      className="mt-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
                    >
                      Move to My Eyes Only
                    </button>
                  )}

              <button
                type="button"
                onClick={() => {
                  onDelete(memory.id);
                  onClose();
                }}
                className="mt-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 active:scale-95"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-xs text-white transition hover:bg-white/10 active:scale-95"
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}

export default MemoryViewer;
