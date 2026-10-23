'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../services/api-client';
import type { Conversation, SendMessageRequest } from '../../types';
import {
  MAX_SENDABLE_BYTES,
  blobToDataUrl,
  downscalePhotoToFit,
  formatBytes,
} from './capture-send';

/**
 * A photo/video the camera page actually captured. The page owns the
 * objectUrl's lifetime: it is revoked exactly once — when the capture is
 * discarded, sent, saved, or the page unmounts (QC-F-138).
 */
export interface CapturedMedia {
  blob: Blob;
  kind: 'photo' | 'video';
  objectUrl: string;
  sizeBytes: number;
  /** Lens baked into a photo's canvas pixels; always null for video
   *  (MediaRecorder records the raw stream, so no lens is in the video). */
  lensId: string | null;
  lensName: string | null;
}

interface CapturePreviewProps {
  captured: CapturedMedia;
  /** Retake — page revokes the objectUrl and returns to the viewfinder. */
  onDiscard: () => void;
  /** Send/save succeeded — page revokes the objectUrl and confirms honestly. */
  onDone: (message: string) => void;
}

type ViewMode = 'once' | 'keep';

function conversationLabel(conv: Conversation): string {
  if (conv.name) return conv.name;
  const names = (conv.participants ?? []).map((p) => p.displayName).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Conversation';
}

/**
 * QC-F-138 — post-capture preview for the camera tab.
 *
 * Before this component existed, the camera page's capture handlers built a
 * download link they never clicked and revoked the object URL immediately:
 * every captured photo/video silently vanished while the UI behaved as if
 * the capture had succeeded. This preview is the honest destination:
 * retake, send to a real conversation (the same data-URL snap transport the
 * chat composer uses), save to the real Memories backend, or save to the
 * device. "My Story" stays honestly disabled — story media needs a hosted
 * URL and the real upload is still tracked as QC-F-063; the simulated
 * presigned endpoint is never used to fake one.
 */
export function CapturePreview({ captured, onDiscard, onDone }: CapturePreviewProps) {
  const [caption, setCaption] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('once');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<Conversation | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [savingMemory, setSavingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [savedToDevice, setSavedToDevice] = useState(false);

  const oversize = captured.sizeBytes > MAX_SENDABLE_BYTES;
  // A photo gets a step-down attempt at send/save time (§4d); a video cannot
  // be re-encoded here, so an oversize video is honestly blocked up front.
  const hardBlocked = oversize && captured.kind === 'video';
  const busy = sendingTo !== null || savingMemory;

  const loadConversations = useCallback(async () => {
    setPickerError(null);
    setConversations(null);
    const res = await apiClient.getConversations();
    if (res.success && res.data) {
      setConversations(res.data);
    } else {
      setPickerError(res.error?.message ?? 'Could not load your conversations.');
    }
  }, []);

  useEffect(() => {
    if (pickerOpen && conversations === null && !pickerError) {
      void loadConversations();
    }
  }, [pickerOpen, conversations, pickerError, loadConversations]);

  const handleSend = useCallback(
    async (conv: Conversation) => {
      setSendError(null);
      setSendingTo(conv);
      try {
        let blob = captured.blob;
        if (captured.kind === 'photo' && blob.size > MAX_SENDABLE_BYTES) {
          blob = await downscalePhotoToFit(blob, MAX_SENDABLE_BYTES);
        }
        if (blob.size > MAX_SENDABLE_BYTES) {
          setSendError(
            `This ${captured.kind === 'photo' ? 'photo' : 'video'} is ${formatBytes(blob.size)} — too large to send until real uploads (QC-F-063) land. You can still save it to this device.`,
          );
          return;
        }
        const dataUrl = await blobToDataUrl(blob);
        const isOnce = viewMode === 'once';
        const type: SendMessageRequest['type'] = isOnce
          ? captured.kind === 'photo'
            ? 'snap_photo'
            : 'snap_video'
          : captured.kind === 'photo'
            ? 'image'
            : 'video';
        const res = await apiClient.sendMessage({
          conversationId: conv.id,
          content: caption.trim() || (captured.kind === 'photo' ? 'Photo Snap' : 'Video Snap'),
          type,
          mediaUrl: dataUrl,
          ...(isOnce
            ? {
                disappearMode: 'after_view' as const,
                metadata: { snap: { durationSec: 10 } },
              }
            : {}),
        });
        if (res.success) {
          onDone(`Sent to ${conversationLabel(conv)}`);
        } else {
          setSendError(res.error?.message ?? 'Send failed — your capture is still here.');
        }
      } catch {
        setSendError('Send failed — your capture is still here. Check your connection and retry.');
      } finally {
        setSendingTo(null);
      }
    },
    [captured, caption, viewMode, onDone],
  );

  const handleSaveToMemories = useCallback(async () => {
    setMemoryError(null);
    setSavingMemory(true);
    try {
      let blob = captured.blob;
      if (captured.kind === 'photo' && blob.size > MAX_SENDABLE_BYTES) {
        blob = await downscalePhotoToFit(blob, MAX_SENDABLE_BYTES);
      }
      if (blob.size > MAX_SENDABLE_BYTES) {
        setMemoryError(
          `This ${captured.kind === 'photo' ? 'photo' : 'video'} is ${formatBytes(blob.size)} — too large to save until real uploads (QC-F-063) land. You can still save it to this device.`,
        );
        return;
      }
      const dataUrl = await blobToDataUrl(blob);
      const res = await apiClient.createMemory({
        mediaUrl: dataUrl,
        mediaType: captured.kind === 'photo' ? 'PHOTO' : 'VIDEO',
        caption: caption.trim() || undefined,
      });
      if (res.success) {
        onDone('Saved to Memories');
      } else {
        setMemoryError(res.error?.message ?? 'Could not save to Memories — your capture is still here.');
      }
    } catch {
      setMemoryError('Could not save to Memories — your capture is still here.');
    } finally {
      setSavingMemory(false);
    }
  }, [captured, caption, onDone]);

  // The download the old handlers half-built: the missing piece was the
  // click itself. The objectUrl is NOT revoked here — the page owns it and
  // revokes when the capture is discarded/sent/saved, so the preview (and
  // repeat saves) keep working.
  const handleSaveToDevice = useCallback(() => {
    const a = document.createElement('a');
    a.href = captured.objectUrl;
    a.download = `quantchat-${captured.kind}-${Date.now()}.${captured.kind === 'photo' ? 'jpg' : 'webm'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSavedToDevice(true);
  }, [captured]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-black" data-testid="capture-preview">
      {/* Captured media */}
      <div className="relative flex-1 min-h-0">
        {captured.kind === 'photo' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={captured.objectUrl}
            alt="Your captured photo"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <video
            src={captured.objectUrl}
            controls
            autoPlay
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Discard and retake"
          className="absolute left-4 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white text-xl"
        >
          ✕
        </button>
      </div>

      {/* Honest facts about this capture */}
      <div className="px-4 pt-3 text-white/70 text-xs">
        <span>{formatBytes(captured.sizeBytes)}</span>
        {captured.kind === 'photo' && captured.lensName && (
          <span> · Lens: {captured.lensName}</span>
        )}
        {oversize && captured.kind === 'video' && (
          <p className="mt-1 text-amber-300">
            Too large to send or save to Memories right now — real uploads for large media are
            still being built (QC-F-063). Saving to this device always works.
          </p>
        )}
        {oversize && captured.kind === 'photo' && (
          <p className="mt-1 text-amber-300">
            Large photo — sending will shrink it to fit; if it still does not fit, you will be
            told here instead of it silently failing.
          </p>
        )}
      </div>

      {/* Caption */}
      <div className="px-4 pt-2">
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption…"
          aria-label="Caption"
          className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-base text-white placeholder-white/50 outline-none"
        />
      </div>

      {/* View-once / keep toggle (the chat snap composer's pattern) */}
      <div className="flex gap-2 px-4 pt-3" role="group" aria-label="How long it stays">
        <button
          type="button"
          aria-pressed={viewMode === 'once'}
          onClick={() => setViewMode('once')}
          className={`rounded-full px-3 py-1.5 text-sm ${viewMode === 'once' ? 'bg-emerald-500 text-black font-semibold' : 'bg-white/10 text-white'}`}
        >
          View once
        </button>
        <button
          type="button"
          aria-pressed={viewMode === 'keep'}
          onClick={() => setViewMode('keep')}
          className={`rounded-full px-3 py-1.5 text-sm ${viewMode === 'keep' ? 'bg-emerald-500 text-black font-semibold' : 'bg-white/10 text-white'}`}
        >
          Keep in chat
        </button>
      </div>

      {sendError && (
        <div className="mx-4 mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {sendError}
          {sendingTo === null && pickerOpen && (
            <span className="block pt-1 text-white/70">Tap a conversation below to retry.</span>
          )}
        </div>
      )}
      {memoryError && (
        <div className="mx-4 mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {memoryError}
        </div>
      )}

      {/* Destinations */}
      <div className="grid grid-cols-2 gap-2 px-4 py-4">
        <button
          type="button"
          disabled={hardBlocked || busy}
          onClick={() => setPickerOpen((v) => !v)}
          className="rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          Send to…
        </button>
        <button
          type="button"
          disabled={hardBlocked || busy}
          onClick={() => void handleSaveToMemories()}
          className="rounded-xl bg-white/10 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {savingMemory ? 'Saving…' : 'Save to Memories'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleSaveToDevice}
          className="rounded-xl bg-white/10 py-3 text-sm font-semibold text-white"
        >
          {savedToDevice ? 'Saved to device ✓' : 'Save to device'}
        </button>
        <div>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full rounded-xl bg-white/5 py-3 text-sm font-semibold text-white/40"
          >
            My Story
          </button>
          <p className="pt-1 text-center text-[11px] leading-tight text-white/50">
            Story posting needs real uploads — coming with QC-F-063.
          </p>
        </div>
      </div>

      {/* Conversation picker */}
      {pickerOpen && (
        <div className="max-h-56 overflow-y-auto border-t border-white/10 px-4 py-3">
          {conversations === null && !pickerError && (
            <p className="text-sm text-white/60">Loading conversations…</p>
          )}
          {pickerError && (
            <div className="text-sm text-red-200">
              {pickerError}{' '}
              <button type="button" onClick={() => void loadConversations()} className="underline">
                Retry
              </button>
            </div>
          )}
          {conversations !== null && conversations.length === 0 && (
            <p className="text-sm text-white/60">No conversations yet — start a chat first.</p>
          )}
          {conversations?.map((conv) => (
            <button
              key={conv.id}
              type="button"
              disabled={busy}
              onClick={() => void handleSend(conv)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-white hover:bg-white/10 disabled:opacity-50"
            >
              <span className="flex-1 truncate text-sm">{conversationLabel(conv)}</span>
              <span className="text-xs text-emerald-300">
                {sendingTo?.id === conv.id ? 'Sending…' : 'Send'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
