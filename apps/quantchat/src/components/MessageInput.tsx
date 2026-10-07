// ============================================================================
// QuantChat - MessageInput Component
// Rich input with media attachment, emoji, voice recording, mentions
// ============================================================================

import React, { useState, useRef } from 'react';
import type { MessageType } from '../types';

interface MessageInputProps {
  onSend: (content: string, type: MessageType, mediaUrl?: string) => void;
  onTyping: (isTyping: boolean) => void;
  replyingTo?: { id: string; content: string } | null;
  onCancelReply?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  onTyping,
  replyingTo,
  onCancelReply,
  placeholder = 'Message...',
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordingRef = useRef<NodeJS.Timeout | null>(null);

  const handleTextChange = (value: string) => {
    setText(value);
    onTyping(value.length > 0);
  };

  const handleSend = () => {
    if (text.trim()) {
      onSend(text.trim(), 'text');
      setText('');
      onTyping(false);
      setShowEmojiPicker(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingDuration(0);
    recordingRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    if (recordingRef.current) {
      clearInterval(recordingRef.current);
    }
    if (recordingDuration > 0) {
      const voiceUrl = `https://media.quant.chat/voice_${Date.now()}.m4a`;
      onSend('', 'voice', voiceUrl);
    }
    setRecordingDuration(0);
  };

  const handleAttachment = (type: MessageType, url?: string) => {
    const mediaUrl = url || `https://media.quant.chat/${type}_${Date.now()}`;
    onSend('', type, mediaUrl);
    setShowAttachMenu(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const quickEmojis = ['😀', '😂', '❤️', '🔥', '👍', '😢', '😮', '🎉', '💯', '✨'];

  return (
    <div className="message-input-component">
      {/* Reply preview */}
      {replyingTo && (
        <div className="reply-bar">
          <div className="reply-content">
            <span className="reply-label">Replying to:</span>
            <span className="reply-text">{replyingTo.content.substring(0, 60)}</span>
          </div>
          <button className="cancel-reply" onClick={onCancelReply}>
            ✕
          </button>
        </div>
      )}

      {/* Recording UI */}
      {isRecording && (
        <div className="recording-ui">
          <span className="rec-indicator">● Recording</span>
          <span className="rec-duration">{formatDuration(recordingDuration)}</span>
          <button
            className="cancel-recording"
            onClick={() => {
              setIsRecording(false);
              if (recordingRef.current) clearInterval(recordingRef.current);
              setRecordingDuration(0);
            }}
          >
            Cancel
          </button>
          <button className="stop-recording" onClick={handleStopRecording}>
            Send
          </button>
        </div>
      )}

      {/* Main input area */}
      {!isRecording && (
        <div className="input-bar">
          <button
            className="attach-btn"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            disabled={disabled}
            aria-label="Attach file"
            aria-expanded={showAttachMenu}
          >
            +
          </button>

          <div className="text-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className="message-text-input"
              aria-label="Type a message"
            />
          </div>

          <button
            className="emoji-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={disabled}
            aria-label="Toggle emoji picker"
            aria-expanded={showEmojiPicker}
          >
            😀
          </button>

          {text.trim() ? (
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={disabled}
              aria-label="Send message"
            >
              ➤
            </button>
          ) : (
            <button
              className="voice-btn"
              onPointerDown={handleStartRecording}
              onPointerUp={handleStopRecording}
              disabled={disabled}
              aria-label="Record voice message"
            >
              🎤
            </button>
          )}
        </div>
      )}

      {/* Attachment menu */}
      {showAttachMenu && (
        <div className="attach-menu">
          <button onClick={() => handleAttachment('image')}>🖼️ Photo</button>
          <button onClick={() => handleAttachment('video')}>🎬 Video</button>
          <button onClick={() => handleAttachment('file')}>📎 File</button>
          <button onClick={() => handleAttachment('location')}>📍 Location</button>
          <button onClick={() => handleAttachment('contact')}>👤 Contact</button>
          <button onClick={() => handleAttachment('gif')}>GIF</button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className="emoji-picker">
          <div className="quick-emojis">
            {quickEmojis.map((emoji) => (
              <button key={emoji} onClick={() => handleEmojiSelect(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default MessageInput;
