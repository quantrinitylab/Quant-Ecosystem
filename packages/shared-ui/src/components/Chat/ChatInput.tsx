'use client';

// ============================================================================
// Shared UI - Chat Input Component
// ============================================================================

import React, { useState, useRef, useCallback } from 'react';

export interface ChatInputProps {
  onSend: (message: string, attachments?: File[]) => void;
  onTyping?: (isTyping: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  showAttachButton?: boolean;
  showEmojiButton?: boolean;
  showVoiceButton?: boolean;
  replyingTo?: { sender: string; message: string };
  onCancelReply?: () => void;
  className?: string;
  /**
   * Called when a voice recording completes with real audio. When provided,
   * the mic button records via MediaRecorder and delivers the audio blob.
   * When omitted, tapping the mic shows a "coming soon" notice instead of
   * doing nothing.
   */
  onVoiceMessage?: (audioBlob: Blob, durationMs: number) => void;
  /**
   * `placeholder` is a fallback of last resort in the accessible-name algorithm
   * and it disappears as soon as there is text, so a reader that re-reads the
   * composer mid-message gets an unnamed textarea. Overridable because "Message"
   * is wrong in a comment thread or a support console.
   */
  'aria-label'?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onTyping,
  placeholder = 'Type a message...',
  disabled = false,
  maxLength = 4000,
  showAttachButton = true,
  showEmojiButton = true,
  showVoiceButton = true,
  replyingTo,
  onCancelReply,
  className = '',
  onVoiceMessage,
  'aria-label': ariaLabel = 'Message',
}) => {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Voice recording state (real MediaRecorder, not a fake timer) ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVoiceMessageRef = useRef(onVoiceMessage);
  onVoiceMessageRef.current = onVoiceMessage;

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  const stopTracks = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      return;
    }
    recorder.stop(); // onstop handler finalizes the blob
  }, []);

  const startRecording = useCallback(async () => {
    // No handler wired: honest "coming soon" instead of a dead button.
    if (!onVoiceMessageRef.current) {
      showNotice('Voice messages coming soon');
      return;
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      showNotice('Voice recording not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : undefined;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const elapsed = Date.now() - recordStartRef.current;
        setIsRecording(false);
        setRecordElapsedMs(0);
        stopTracks();
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type });
        audioChunksRef.current = [];
        // Ignore accidental sub-second taps.
        if (elapsed > 400 && blob.size > 0) {
          onVoiceMessageRef.current?.(blob, elapsed);
        }
        mediaRecorderRef.current = null;
      };
      recorder.onerror = () => {
        showNotice('Recording failed — please try again');
        setIsRecording(false);
        stopTracks();
      };
      recordStartRef.current = Date.now();
      setRecordElapsedMs(0);
      setIsRecording(true);
      recorder.start(250);
      recordTimerRef.current = setInterval(() => {
        setRecordElapsedMs(Date.now() - recordStartRef.current);
      }, 250);
    } catch {
      showNotice('Microphone access denied');
    }
  }, [showNotice, stopTracks]);

  const handleVoiceButtonClick = useCallback(() => {
    if (disabled) return;
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [disabled, isRecording, startRecording, stopRecording]);

  // Release the mic if the component unmounts mid-recording.
  React.useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Attach menu: the upload transport has no real object-storage backend yet
  // (presigned URLs are simulated), so each option is honest about being
  // unavailable instead of fabricating a media URL. The menu itself is real —
  // it opens, closes, and dismisses on outside tap.
  const ATTACH_OPTIONS = [
    { id: 'photo', label: 'Photo', icon: '🖼️' },
    { id: 'video', label: 'Video', icon: '🎬' },
    { id: 'file', label: 'File', icon: '📎' },
  ] as const;

  const handleAttachOption = useCallback(
    (option: (typeof ATTACH_OPTIONS)[number]) => {
      setShowAttachMenu(false);
      showNotice(`${option.label} attachments coming soon`);
    },
    [showNotice],
  );

  // Emoji panel: a real picker — tapping an emoji inserts it at the cursor.
  const EMOJI_GRID = [
    '😀', '😂', '❤️', '🔥', '👍', '😢', '😮', '🎉',
    '💯', '✨', '🙏', '👏', '😎', '🥳', '🤔', '😴',
    '👋', '💪', '🌟', '🎊', '❌', '✅', '⭐', '💡',
  ];

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + emoji + message.slice(end);
    setMessage(next);
    // Restore caret after the inserted emoji on the next paint.
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, [message]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length > maxLength) return;
      setMessage(value);

      // Handle typing indicator
      if (!isTyping) {
        setIsTyping(true);
        onTyping?.(true);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        onTyping?.(false);
      }, 2000);

      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
      }
    },
    [isTyping, maxLength, onTyping],
  );

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setMessage('');
    setIsTyping(false);
    onTyping?.(false);
    setShowEmojiPanel(false);
    setShowAttachMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, onSend, onTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className={`border-t border-gray-200 bg-white ${className}`}>
      {replyingTo && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-blue-600">
              Replying to {replyingTo.sender}
            </span>
            <p className="text-xs text-gray-500 truncate">{replyingTo.message}</p>
          </div>
          {/*
            Every other icon-only button in this file already carries a name —
            "Attach file", "Emoji", "Send message", "Voice message". This one did
            not, so the only way out of a reply was announced as the empty
            string, and the one thing a reader could not do was stop replying.
          */}
          <button
            type="button"
            onClick={onCancelReply}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 ml-2"
            aria-label="Cancel reply"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        {showAttachButton && (
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu((v) => !v);
              setShowEmojiPanel(false);
            }}
            disabled={disabled}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
            aria-label="Attach file"
            aria-expanded={showAttachMenu}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
        )}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-2xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
            style={{ maxHeight: '150px' }}
            aria-label={ariaLabel}
          />
          {showEmojiButton && (
            <button
              type="button"
              onClick={() => {
                setShowEmojiPanel((v) => !v);
                setShowAttachMenu(false);
              }}
              disabled={disabled}
              className="absolute right-1.5 bottom-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600"
              aria-label="Emoji"
              aria-expanded={showEmojiPanel}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          )}
        </div>
        {message.trim() ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
            aria-label="Send message"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        ) : showVoiceButton ? (
          <button
            type="button"
            onClick={handleVoiceButtonClick}
            disabled={disabled}
            className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            aria-label={isRecording ? 'Stop recording' : 'Voice message'}
            aria-pressed={isRecording}
          >
            {isRecording ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full bg-white animate-pulse"
                  aria-hidden="true"
                />
                <span className="text-xs font-medium tabular-nums">
                  {Math.floor(recordElapsedMs / 60000)}:
                  {String(Math.floor((recordElapsedMs % 60000) / 1000)).padStart(2, '0')}
                </span>
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </span>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="px-4 pb-2 text-xs text-gray-500"
        >
          {notice}
        </p>
      )}
      {/* Attach menu — real open/close; options honestly report unavailability */}
      {showAttachMenu && (
        <div
          role="menu"
          aria-label="Attachment options"
          className="mx-3 mb-2 flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          {ATTACH_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={() => handleAttachOption(option)}
              className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-100"
            >
              <span className="text-xl" aria-hidden="true">
                {option.icon}
              </span>
              <span className="text-xs font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      )}
      {/* Emoji picker — inserts the tapped emoji at the cursor */}
      {showEmojiPanel && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className="mx-3 mb-2 grid grid-cols-8 gap-1 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          {EMOJI_GRID.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-2xl hover:bg-gray-100"
              aria-label={`Insert ${emoji} emoji`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {message.length > maxLength * 0.9 && (
        <p className="px-4 pb-1 text-xs text-orange-500">
          {message.length}/{maxLength}
        </p>
      )}
    </div>
  );
};
