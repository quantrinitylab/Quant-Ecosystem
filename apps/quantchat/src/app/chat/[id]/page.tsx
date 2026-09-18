'use client';

import { use, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { ChatBubble, ChatInput, TypingIndicator, TopBar } from '@quant/shared-ui';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useMessages } from '../../../hooks/useMessages';
import { useSendMessage } from '../../../hooks/useSendMessage';
import { useRealtimeChat } from '../../../hooks/useRealtimeChat';
import { useChatSocket } from '../../../hooks/useChatSocket';
import { messageListVariants, messageVariants } from '../../../lib/motion-variants';
import { ReactionPicker } from '../../../components/ReactionPicker';
import { VoiceNoteRecorder } from '../../../components/VoiceNoteRecorder';
import { LinkPreviewCard } from '../../../components/LinkPreviewCard';
import { AIAgentPanel } from '../../../components/chat/AIAgentPanel';
import { ReplySuggestions } from '../../../components/chat/ReplySuggestions';
import { GameLauncher } from '../../../components/games/GameLauncher';

type DeliveryStatus = 'sent' | 'delivered' | 'read';

interface EnhancedMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  status: DeliveryStatus;
  reactions: string[];
  replyTo?: { id: string; content: string; sender: string } | null;
  imageUrl?: string;
  mediaUrl?: string;
  linkPreview?: { url: string; title: string; description?: string; imageUrl?: string } | null;
  type: 'text' | 'image' | 'voice' | 'snap_photo' | 'snap_video';
  voiceDurationMs?: number;
  snapDurationSec?: number;
}

function DeliveryIndicator({ status }: { status: DeliveryStatus }) {
  if (status === 'sent') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--quant-muted-foreground)]"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === 'delivered') {
    return (
      <svg
        width="16"
        height="14"
        viewBox="0 0 28 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--quant-muted-foreground)]"
      >
        <polyline points="20 6 9 17 4 12" />
        <polyline points="24 6 13 17 10 14" />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="14"
      viewBox="0 0 28 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-500"
    >
      <polyline points="20 6 9 17 4 12" />
      <polyline points="24 6 13 17 10 14" />
    </svg>
  );
}

function detectLink(text: string): { url: string; title: string; description?: string } | null {
  const urlRegex = /https?:\/\/[^\s]+/;
  const match = text.match(urlRegex);
  if (match) {
    const url = match[0];
    let hostname = url;
    try {
      hostname = new URL(url).hostname;
    } catch {
      /* use raw */
    }
    return {
      url,
      title: `Link from ${hostname}`,
      description: `Shared content from ${hostname}`,
    };
  }
  return null;
}

// Delivery status ordering so out-of-order receipt events never downgrade a
// tick (read supersedes delivered supersedes sent).
const STATUS_RANK: Record<DeliveryStatus, number> = { sent: 1, delivered: 2, read: 3 };

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error, refetch } = useMessages(id);
  const sendMessage = useSendMessage();
  const { typingUsers, incomingMessages, isConnected, sendRealtimeMessage, setTyping, markRead } =
    useRealtimeChat(id);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});

  // Real per-message delivery/read state (Requirement 12.5). Indicators are
  // driven exclusively by live `message:delivered` / `message:read` events from
  // the backend over the shared chat socket — never fabricated from list index.
  const [statusByMessageId, setStatusByMessageId] = useState<Record<string, DeliveryStatus>>({});
  const handleDeliveryEvent = useCallback(
    (event: {
      type?: string;
      data?: { messageId?: string };
      payload?: { type?: string; messageId?: string };
    }) => {
      const type = event?.type ?? event?.payload?.type;
      if (type !== 'message:delivered' && type !== 'message:read') return;
      const source = event?.data ?? event?.payload ?? event;
      const messageId = (source as { messageId?: string })?.messageId;
      if (!messageId) return;
      const next: DeliveryStatus = type === 'message:read' ? 'read' : 'delivered';
      setStatusByMessageId((prev) => {
        const current = prev[messageId];
        if (current && STATUS_RANK[current] >= STATUS_RANK[next]) return prev;
        return { ...prev, [messageId]: next };
      });
    },
    [],
  );
  const { subscribe: subscribeChatSocket } = useChatSocket(handleDeliveryEvent);
  useEffect(() => {
    if (id) subscribeChatSocket(id);
  }, [id, subscribeChatSocket]);

  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; sender: string } | null>(
    null,
  );

  // Orphaned-feature wiring: AI auto-reply panel + in-chat games launcher.
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showGames, setShowGames] = useState(false);

  // Snap Ephemeral state tracking
  const [snapStates, setSnapStates] = useState<
    Record<string, { isOpened: boolean; openedAt?: string; replayCount: number }>
  >({});
  const [activeSnap, setActiveSnap] = useState<{
    id: string;
    type: 'snap_photo' | 'snap_video';
    mediaUrl?: string;
    durationSec: number;
    sender: string;
  } | null>(null);
  const [snapSecondsRemaining, setSnapSecondsRemaining] = useState(10);
  const [snapProgress, setSnapProgress] = useState(100);
  const pressHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quick Camera & Composer duration state
  const [showSnapCamera, setShowSnapCamera] = useState(false);
  const [snapType, setSnapType] = useState<'snap_photo' | 'snap_video'>('snap_photo');
  const [snapDuration, setSnapDuration] = useState<number>(10);
  const [snapMediaPreview, setSnapMediaPreview] = useState<string | null>(null);
  const [snapCaption, setSnapCaption] = useState('');
  const [composerDuration, setComposerDuration] = useState<
    '10s' | '30s' | 'view_once' | '24h' | 'off'
  >('view_once');
  const snapFileInputRef = useRef<HTMLInputElement>(null);

  const lastMarkedRef = useRef<string | null>(null);

  const messages: EnhancedMessage[] = useMemo(() => {
    const restMessages = data ?? [];
    const realtimeIds = new Set(incomingMessages.map((m) => m.id));
    const deduped = restMessages.filter((m: { id: string }) => !realtimeIds.has(m.id));

    const allMsgs = [
      ...deduped.map(
        (msg: {
          id: string;
          message?: string;
          content?: string;
          sender?: string;
          role?: string;
          timestamp?: string;
          type?: string;
          imageUrl?: string;
          mediaUrl?: string;
          voiceDurationMs?: number;
          metadata?: Record<string, unknown>;
          snapDurationSec?: number;
        }) => {
          const content = msg.message ?? msg.content ?? '';
          const linkPreview = detectLink(content);
          const rawType = msg.type || 'text';
          const type = (
            ['text', 'image', 'voice', 'snap_photo', 'snap_video'].includes(rawType)
              ? rawType
              : 'text'
          ) as 'text' | 'image' | 'voice' | 'snap_photo' | 'snap_video';
          const snapMeta = (msg.metadata?.snap as { durationSec?: number }) || {};
          const snapDurationSec =
            msg.snapDurationSec ??
            snapMeta.durationSec ??
            (type === 'snap_photo' || type === 'snap_video' ? 10 : undefined);
          return {
            id: msg.id,
            content,
            sender: (msg.sender ?? msg.role ?? 'other') as string,
            timestamp: msg.timestamp ?? '',
            status: (statusByMessageId[msg.id] ?? 'sent') as DeliveryStatus,
            reactions: reactions[msg.id] || [],
            replyTo: null,
            imageUrl: msg.imageUrl,
            mediaUrl: msg.mediaUrl || msg.imageUrl,
            linkPreview,
            type,
            voiceDurationMs: msg.voiceDurationMs,
            snapDurationSec,
          };
        },
      ),
      ...incomingMessages.map((msg: any) => {
        const linkPreview = detectLink(msg.content);
        const rawType = msg.type || 'text';
        const type = (
          ['text', 'image', 'voice', 'snap_photo', 'snap_video'].includes(rawType)
            ? rawType
            : 'text'
        ) as 'text' | 'image' | 'voice' | 'snap_photo' | 'snap_video';
        return {
          id: msg.id,
          content: msg.content,
          sender: msg.sender,
          timestamp: msg.timestamp,
          status: (statusByMessageId[msg.id] ?? 'sent') as DeliveryStatus,
          reactions: reactions[msg.id] || [],
          replyTo: null,
          imageUrl: msg.imageUrl,
          mediaUrl: msg.mediaUrl || msg.imageUrl,
          linkPreview,
          type,
          snapDurationSec:
            msg.snapDurationSec ??
            (type === 'snap_photo' || type === 'snap_video' ? 10 : undefined),
        };
      }),
    ];

    return allMsgs;
  }, [data, incomingMessages, reactions, statusByMessageId]);

  const handleReaction = useCallback((msgId: string, emoji: string) => {
    setReactions((prev) => ({
      ...prev,
      [msgId]: [...(prev[msgId] || []), emoji],
    }));
  }, []);

  // Countdown timer for active fullscreen snap viewer
  useEffect(() => {
    if (!activeSnap) return;

    const totalDuration = activeSnap.durationSec || 10;
    setSnapSecondsRemaining(totalDuration);
    setSnapProgress(100);

    const startTime = Date.now();
    const endTime = startTime + totalDuration * 1000;

    const interval = setInterval(() => {
      const now = Date.now();
      const remainingMs = Math.max(0, endTime - now);
      const remainingSec = Math.ceil(remainingMs / 1000);
      const progressPercent = (remainingMs / (totalDuration * 1000)) * 100;

      setSnapSecondsRemaining(remainingSec);
      setSnapProgress(progressPercent);

      if (remainingMs <= 0) {
        clearInterval(interval);
        handleCloseSnap(activeSnap.id);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeSnap]);

  const handleCloseSnap = useCallback((snapId: string) => {
    // Permanently transition snap to opened state and destroy media URL
    setSnapStates((prev) => {
      const existing = prev[snapId] || { replayCount: 0 };
      return {
        ...prev,
        [snapId]: {
          isOpened: true,
          openedAt: new Date().toISOString(),
          replayCount: existing.replayCount + 1,
        },
      };
    });
    setActiveSnap(null);
  }, []);

  const handleOpenSnap = useCallback((msg: EnhancedMessage) => {
    setActiveSnap({
      id: msg.id,
      type: msg.type as 'snap_photo' | 'snap_video',
      mediaUrl: msg.mediaUrl || msg.imageUrl,
      durationSec: msg.snapDurationSec ?? 10,
      sender: msg.sender,
    });
  }, []);

  const isSnapOpened = useCallback(
    (msgId: string) => {
      return !!snapStates[msgId]?.isOpened;
    },
    [snapStates],
  );

  const canReplay = useCallback(
    (msgId: string) => {
      const state = snapStates[msgId];
      return !!state?.isOpened && state.replayCount === 1;
    },
    [snapStates],
  );

  const startPressHoldReplay = useCallback(
    (msg: EnhancedMessage) => {
      const state = snapStates[msg.id];
      // Allow exactly 1 replay
      if (!state || state.replayCount > 1) return;

      pressHoldTimerRef.current = setTimeout(() => {
        setActiveSnap({
          id: msg.id,
          type: msg.type as 'snap_photo' | 'snap_video',
          mediaUrl: msg.mediaUrl || msg.imageUrl,
          durationSec: msg.snapDurationSec ?? 10,
          sender: msg.sender,
        });
      }, 450);
    },
    [snapStates],
  );

  const cancelPressHoldReplay = useCallback(() => {
    if (pressHoldTimerRef.current) {
      clearTimeout(pressHoldTimerRef.current);
      pressHoldTimerRef.current = null;
    }
  }, []);

  const handleSnapFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSnapMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUseSampleSnap = useCallback(() => {
    if (snapType === 'snap_photo') {
      const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#ff416c;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#ff4b2b;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="600" height="800" fill="url(#grad)" />
        <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="72">📸</text>
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="28" font-weight="bold">QuantSnap Instant Capture</text>
        <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="18" opacity="0.8">View-Once Ephemeral Media</text>
      </svg>`;
      setSnapMediaPreview(`data:image/svg+xml;utf8,${encodeURIComponent(sampleSvg)}`);
    } else {
      const sampleVideoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
        <defs>
          <linearGradient id="vgrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#8e2de2;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#4a00e0;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="600" height="800" fill="url(#vgrad)" />
        <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="72">🟣</text>
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="28" font-weight="bold">QuantSnap Video Snap</text>
        <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="18" opacity="0.8">Ephemeral Video</text>
      </svg>`;
      setSnapMediaPreview(`data:image/svg+xml;utf8,${encodeURIComponent(sampleVideoSvg)}`);
    }
  }, [snapType]);

  const handleSendSnap = useCallback(() => {
    if (!snapMediaPreview) return;
    const content = snapCaption.trim() || (snapType === 'snap_photo' ? 'Photo Snap' : 'Video Snap');

    sendMessage.mutate({
      conversationId: id,
      content,
      type: snapType,
      mediaUrl: snapMediaPreview,
      disappearMode: 'after_view',
    });

    sendRealtimeMessage(content);

    setShowSnapCamera(false);
    setSnapMediaPreview(null);
    setSnapCaption('');
  }, [id, snapMediaPreview, snapCaption, snapType, sendMessage, sendRealtimeMessage]);

  // Wire read receipts: mark latest message from others as read on mount and on new messages
  useEffect(() => {
    const otherMessages = messages.filter((m) => m.sender !== 'self');
    const latestOther = otherMessages[otherMessages.length - 1];
    if (latestOther && latestOther.id !== lastMarkedRef.current) {
      lastMarkedRef.current = latestOther.id;
      markRead(latestOther.id);
    }
  }, [messages, markRead]);

  const handleSend = useCallback(
    (content: string) => {
      // REST POST for persistence
      sendMessage.mutate({ conversationId: id, content, type: 'text' as const });
      // WS broadcast for real-time delivery
      sendRealtimeMessage(content);
      // Stop typing indicator on send
      setTyping(false);
      // Clear reply-to
      setReplyTo(null);
    },
    [id, sendMessage, sendRealtimeMessage, setTyping],
  );

  const handleVoiceRecording = useCallback(
    (durationMs: number) => {
      sendMessage.mutate({
        conversationId: id,
        content: `Voice note (${Math.ceil(durationMs / 1000)}s)`,
        type: 'text' as const,
      });
    },
    [id, sendMessage],
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      setTyping(isTyping);
    },
    [setTyping],
  );

  // Posts a system message into the conversation (e.g. final game scores from
  // the in-chat GameLauncher). Persists via REST and broadcasts over WS.
  const handlePostSystemMessage = useCallback(
    (text: string) => {
      sendMessage.mutate({ conversationId: id, content: text, type: 'text' as const });
      sendRealtimeMessage(text);
    },
    [id, sendMessage, sendRealtimeMessage],
  );

  // Recent context handed to the AI reply-suggestion strip (oldest → newest).
  const suggestionContext = useMemo(
    () =>
      messages.slice(-10).map((m) => ({
        sender: m.sender,
        content: m.content,
        isSelf: m.sender === 'self',
      })),
    [messages],
  );

  if (isLoading) return <LoadingState variant="skeleton" text="Loading messages..." />;
  if (error) return <ErrorState message={error.message} onRetry={() => void refetch()} />;

  // Connection status: green = connected, yellow = reconnecting (not connected but page is active), gray = disconnected
  const getStatusColor = () => {
    if (isConnected) return 'bg-emerald-500';
    // If not connected, treat as reconnecting (yellow) briefly
    return 'bg-yellow-500';
  };

  const getStatusLabel = () => {
    if (isConnected) return 'Online';
    return 'Reconnecting';
  };

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        title={`Chat ${id}`}
        subtitle="🔥 5 Day Streak · Active now"
        onBack={() => {
          window.location.href = '/';
        }}
        rightActions={[
          <button
            key="call-video"
            type="button"
            onClick={() => {
              window.location.href = `/call?roomId=${encodeURIComponent(id)}&callerName=Friend`;
            }}
            aria-label="Start video call"
            className="min-w-touch min-h-touch flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition-transform"
            title="Video Call (QuantMeet)"
          >
            📹
          </button>,
          <button
            key="call-audio"
            type="button"
            onClick={() => {
              window.location.href = `/call?roomId=${encodeURIComponent(id)}&callerName=Friend&audioOnly=true`;
            }}
            aria-label="Start audio call"
            className="min-w-touch min-h-touch flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition-transform"
            title="Voice Call"
          >
            📞
          </button>,
          <button
            key="games"
            type="button"
            onClick={() => setShowGames(true)}
            aria-label="Open games"
            className="min-w-touch min-h-touch flex items-center justify-center text-lg"
            title="Play a game"
          >
            🎮
          </button>,
          <button
            key="ai"
            type="button"
            onClick={() => setShowAIPanel((v) => !v)}
            aria-label="Toggle AI auto-reply"
            aria-pressed={showAIPanel}
            className={`min-w-touch min-h-touch flex items-center justify-center text-lg transition-opacity ${
              showAIPanel ? 'opacity-100' : 'opacity-70'
            }`}
            title="Quant AI"
          >
            👽
          </button>,
          <div key="status" className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            <span className="text-xs text-[var(--quant-muted-foreground)]">{getStatusLabel()}</span>
          </div>,
        ]}
      />
      <AnimatePresence>
        {showAIPanel && (
          <motion.div
            className="px-3 pt-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', ...spring.stiff }}
          >
            <AIAgentPanel
              conversationId={id}
              onToggle={(enabled) => {
                if (!enabled) setShowAIPanel(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Send a message to start the conversation"
          />
        ) : (
          <motion.div
            variants={messageListVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                variants={messageVariants}
                className="relative group"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setReactionPickerMsgId(msg.id);
                }}
              >
                {/* Reply-to preview */}
                {msg.replyTo && (
                  <div className="ml-10 mb-1 px-3 py-1 rounded-lg bg-[var(--quant-muted)] border-l-2 border-emerald-500 text-xs text-[var(--quant-muted-foreground)]">
                    <span className="font-medium">{msg.replyTo.sender}</span>:{' '}
                    {msg.replyTo.content.slice(0, 60)}
                  </div>
                )}

                {/* Image message */}
                {msg.type === 'image' && msg.imageUrl && (
                  <div
                    className={`flex ${msg.sender === 'self' ? 'justify-end' : 'justify-start'} mb-1`}
                  >
                    <div className="rounded-2xl overflow-hidden max-w-[200px] border border-[var(--quant-border)]">
                      <img
                        src={msg.imageUrl}
                        alt="Shared image"
                        className="w-full h-auto object-cover"
                      />
                    </div>
                  </div>
                )}

                {/* Voice note */}
                {msg.type === 'voice' && (
                  <div
                    className={`flex ${msg.sender === 'self' ? 'justify-end' : 'justify-start'} mb-1`}
                  >
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[var(--quant-surface)] border border-[var(--quant-border)]">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-emerald-500"
                      >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                      <div className="flex items-center gap-0.5">
                        {[3, 5, 8, 4, 7, 6, 3, 5, 8, 4].map((h, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-emerald-500 rounded-full"
                            style={{ height: `${h * 2}px` }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-[var(--quant-muted-foreground)]">
                        {msg.voiceDurationMs ? `${Math.ceil(msg.voiceDurationMs / 1000)}s` : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* Snapchat-style Ephemeral View-Once Snap messages */}
                {(msg.type === 'snap_photo' || msg.type === 'snap_video') && (
                  <div
                    className={`flex ${msg.sender === 'self' ? 'justify-end' : 'justify-start'} mb-1`}
                  >
                    {isSnapOpened(msg.id) ? (
                      // Opened snap card
                      <div
                        onMouseDown={() => startPressHoldReplay(msg)}
                        onMouseUp={cancelPressHoldReplay}
                        onMouseLeave={cancelPressHoldReplay}
                        onTouchStart={() => startPressHoldReplay(msg)}
                        onTouchEnd={cancelPressHoldReplay}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[var(--quant-surface)] border border-[var(--quant-border)] text-xs text-[var(--quant-muted-foreground)] select-none transition-colors hover:bg-[var(--quant-muted)]/50"
                        title={canReplay(msg.id) ? 'Press and hold to replay' : 'Opened'}
                      >
                        {/* ⬜ gray outline square icon */}
                        <div className="w-5 h-5 rounded border-2 border-[var(--quant-muted-foreground)]/60 flex items-center justify-center">
                          <span className="text-[10px] text-[var(--quant-muted-foreground)]">
                            ⬜
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-[var(--quant-foreground)]">
                            Opened · Just now
                          </span>
                          {canReplay(msg.id) && (
                            <span className="text-[10px] text-amber-500 font-medium">
                              Press and hold to replay
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      // Unopened snap card
                      <button
                        type="button"
                        onClick={() => handleOpenSnap(msg)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all active:scale-95 shadow-sm text-left ${
                          msg.type === 'snap_photo'
                            ? 'bg-red-500/10 border-red-500/30 hover:border-red-500/60 hover:bg-red-500/15'
                            : 'bg-purple-500/10 border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/15'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm ${
                            msg.type === 'snap_photo'
                              ? 'bg-red-500 text-white'
                              : 'bg-purple-600 text-white'
                          }`}
                        >
                          {msg.type === 'snap_photo' ? '🔴' : '🟣'}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[var(--quant-foreground)]">
                              {msg.type === 'snap_photo'
                                ? 'New Photo Snap · Tap to view'
                                : 'New Video Snap · Tap to view'}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                msg.type === 'snap_photo'
                                  ? 'bg-red-500/20 text-red-500'
                                  : 'bg-purple-500/20 text-purple-400'
                              }`}
                            >
                              {msg.snapDurationSec ?? 10}s
                            </span>
                          </div>
                          <span className="text-[11px] text-[var(--quant-muted-foreground)]">
                            Ephemeral view-once
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                {/* Regular message bubble */}
                {msg.type === 'text' && (
                  <ChatBubble
                    message={msg.content}
                    sender={msg.sender === 'self' ? 'self' : 'other'}
                    timestamp={msg.timestamp}
                    status={msg.status}
                  />
                )}

                {/* Link preview */}
                {msg.linkPreview && (
                  <div
                    className={`mt-1 ${msg.sender === 'self' ? 'flex justify-end' : 'flex justify-start'}`}
                  >
                    <LinkPreviewCard
                      url={msg.linkPreview.url}
                      title={msg.linkPreview.title}
                      description={msg.linkPreview.description}
                      imageUrl={msg.linkPreview.imageUrl}
                    />
                  </div>
                )}

                {/* Delivery status */}
                {msg.sender === 'self' && (
                  <div className="flex justify-end mt-0.5 pr-1">
                    <DeliveryIndicator status={msg.status} />
                  </div>
                )}

                {/* Reactions display */}
                {msg.reactions.length > 0 && (
                  <div
                    className={`flex gap-0.5 mt-1 ${msg.sender === 'self' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[var(--quant-muted)] border border-[var(--quant-border)] text-sm">
                      {msg.reactions.slice(0, 5).map((r, i) => (
                        <span key={i}>{r}</span>
                      ))}
                      {msg.reactions.length > 1 && (
                        <span className="text-xs text-[var(--quant-muted-foreground)] ml-1">
                          {msg.reactions.length}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Reply button (visible on hover/tap) */}
                <div
                  className={`absolute top-1 ${msg.sender === 'self' ? 'left-0' : 'right-0'} opacity-0 group-hover:opacity-100 transition-opacity`}
                >
                  <button
                    className="min-w-touch min-h-touch flex items-center justify-center text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                    onClick={() =>
                      setReplyTo({ id: msg.id, content: msg.content, sender: msg.sender })
                    }
                    aria-label="Reply"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 17 4 12 9 7" />
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                    </svg>
                  </button>
                </div>

                {/* Reaction picker */}
                {reactionPickerMsgId === msg.id && (
                  <div className="relative">
                    <ReactionPicker
                      isOpen={true}
                      onSelect={(emoji) => handleReaction(msg.id, emoji)}
                      onClose={() => setReactionPickerMsgId(null)}
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
        <TypingIndicator users={typingUsers} />
      </div>

      {/* Reply-to preview above input */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            className="px-4 py-2 bg-[var(--quant-surface)] border-t border-[var(--quant-border)] flex items-center gap-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', ...spring.stiff }}
          >
            <div className="flex-1 border-l-2 border-emerald-500 pl-3">
              <p className="text-xs font-medium text-emerald-500">
                Replying to {replyTo.sender === 'self' ? 'yourself' : replyTo.sender}
              </p>
              <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                {replyTo.content.slice(0, 80)}
              </p>
            </div>
            <button
              className="min-w-touch min-h-touch flex items-center justify-center text-[var(--quant-muted-foreground)]"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
            >
              &#10005;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI reply suggestions (context-driven chips) */}
      <ReplySuggestions
        conversationId={id}
        messages={suggestionContext}
        onSelect={(suggestion) => handleSend(suggestion)}
      />

      {/* Ephemeral Duration selector badge in the composer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-[var(--quant-border)] bg-[var(--quant-surface)]/40 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[var(--quant-muted-foreground)] font-medium flex items-center gap-1 text-[11px]">
            ⏱️ Snap Duration:
          </span>
          <div className="flex items-center gap-1">
            {[
              { id: '10s', label: '10s (View Once)' },
              { id: '30s', label: '30s' },
              { id: '24h', label: '24h' },
              { id: 'off', label: 'Off' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setComposerDuration(option.id as any)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                  composerDuration === option.id
                    ? 'bg-amber-500 text-black font-semibold shadow-xs'
                    : 'bg-[var(--quant-muted)] hover:bg-[var(--quant-border)] text-[var(--quant-muted-foreground)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {composerDuration !== 'off' && (
          <span className="text-[10px] text-amber-500 font-medium">🔥 Ephemeral Mode</span>
        )}
      </div>

      {/* Input area with quick camera and voice note */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--quant-border)] bg-[var(--quant-background)]">
        <button
          type="button"
          onClick={() => {
            setShowSnapCamera(true);
            if (composerDuration === '30s') setSnapDuration(30);
            else if (composerDuration === '24h') setSnapDuration(86400);
            else setSnapDuration(10);
          }}
          aria-label="Quick Snap Camera"
          className="min-w-touch min-h-touch flex items-center justify-center text-xl hover:scale-110 active:scale-95 transition-transform text-[var(--quant-muted-foreground)] hover:text-amber-400"
          title="Send a Snap (Photo / Video)"
        >
          📸
        </button>
        <div className="flex-1">
          <ChatInput
            onSend={handleSend}
            onTyping={handleTyping}
            placeholder={replyTo ? 'Type your reply...' : 'Type a message...'}
          />
        </div>
        <VoiceNoteRecorder onRecordingComplete={handleVoiceRecording} />
      </div>

      {/* Quick Snap Camera Dialog Modal */}
      <AnimatePresence>
        {showSnapCamera && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSnapCamera(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl bg-[var(--quant-surface)] border border-[var(--quant-border)] p-5 shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', ...spring.stiff }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--quant-border)]">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📸</span>
                  <h3 className="font-semibold text-[var(--quant-foreground)]">Send a Snap</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSnapCamera(false)}
                  className="w-8 h-8 rounded-full hover:bg-[var(--quant-muted)] flex items-center justify-center text-[var(--quant-muted-foreground)]"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Mode: Photo vs Video */}
              <div className="flex gap-2 my-4">
                <button
                  type="button"
                  onClick={() => {
                    setSnapType('snap_photo');
                    setSnapMediaPreview(null);
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                    snapType === 'snap_photo'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-border)]'
                  }`}
                >
                  <span>🔴</span> Photo Snap
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSnapType('snap_video');
                    setSnapMediaPreview(null);
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                    snapType === 'snap_video'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-border)]'
                  }`}
                >
                  <span>🟣</span> Video Snap
                </button>
              </div>

              {/* Duration Selector */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-[var(--quant-muted-foreground)] mb-1.5">
                  Snap Duration
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '10s', sec: 10 },
                    { label: '30s', sec: 30 },
                    { label: 'View Once', sec: 10 },
                    { label: '24h', sec: 86400 },
                  ].map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => setSnapDuration(d.sec)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors ${
                        snapDuration === d.sec
                          ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-semibold'
                          : 'border-[var(--quant-border)] bg-[var(--quant-muted)]/50 text-[var(--quant-muted-foreground)] hover:border-[var(--quant-border)]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Media File Picker & Preview */}
              <div className="mb-4">
                <input
                  type="file"
                  ref={snapFileInputRef}
                  accept={snapType === 'snap_photo' ? 'image/*' : 'video/*'}
                  className="hidden"
                  onChange={handleSnapFileSelected}
                />
                {snapMediaPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-[var(--quant-border)] max-h-48 flex items-center justify-center bg-black/20">
                    {snapType === 'snap_photo' ? (
                      <img
                        src={snapMediaPreview}
                        alt="Snap Preview"
                        className="max-h-48 object-contain"
                      />
                    ) : (
                      <video src={snapMediaPreview} controls className="max-h-48 object-contain" />
                    )}
                    <button
                      type="button"
                      onClick={() => setSnapMediaPreview(null)}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => snapFileInputRef.current?.click()}
                      className="w-full py-4 border-2 border-dashed border-[var(--quant-border)] rounded-xl flex flex-col items-center justify-center text-xs text-[var(--quant-muted-foreground)] hover:border-[var(--quant-foreground)]/40 hover:bg-[var(--quant-muted)]/30 transition-colors"
                    >
                      <span className="text-2xl mb-1">📁</span>
                      <span>
                        Choose {snapType === 'snap_photo' ? 'photo' : 'video'} from device
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUseSampleSnap}
                      className="text-xs text-amber-500 hover:text-amber-400 font-medium text-center py-1"
                    >
                      Or capture quick instant snap ⚡
                    </button>
                  </div>
                )}
              </div>

              {/* Caption Input */}
              <div className="mb-5">
                <input
                  type="text"
                  placeholder="Add a caption... (optional)"
                  value={snapCaption}
                  onChange={(e) => setSnapCaption(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--quant-muted)] border border-[var(--quant-border)] text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleSendSnap}
                disabled={!snapMediaPreview}
                className="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-black hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.98]"
              >
                Send Snap 🚀
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Snap Viewer Modal */}
      <AnimatePresence>
        {activeSnap && (
          <motion.div
            className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => handleCloseSnap(activeSnap.id)}
          >
            {/* Top header bar */}
            <div
              className="p-4 flex flex-col gap-2 z-10 bg-gradient-to-b from-black/80 to-transparent"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top progress countdown bar */}
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all ease-linear"
                  style={{
                    width: `${snapProgress}%`,
                    transitionDuration: '100ms',
                  }}
                />
              </div>

              <div className="flex items-center justify-between mt-1 text-white">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{activeSnap.type === 'snap_photo' ? '🔴' : '🟣'}</span>
                  <div>
                    <p className="text-sm font-bold leading-tight">
                      {activeSnap.sender === 'self' ? 'You' : activeSnap.sender}
                    </p>
                    <p className="text-[11px] text-white/70">
                      {activeSnap.type === 'snap_photo' ? 'Photo Snap' : 'Video Snap'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Circular / Top countdown ring badge */}
                  <div className="relative w-8 h-8 flex items-center justify-center rounded-full bg-white/10 border border-white/20">
                    <span className="font-mono text-xs font-bold text-white">
                      {snapSecondsRemaining}s
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCloseSnap(activeSnap.id)}
                    aria-label="Close snap"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Media viewer center */}
            <div
              className="flex-1 flex items-center justify-center p-4 overflow-hidden"
              onClick={() => handleCloseSnap(activeSnap.id)}
            >
              {activeSnap.type === 'snap_video' ? (
                activeSnap.mediaUrl ? (
                  <video
                    src={activeSnap.mediaUrl}
                    autoPlay
                    playsInline
                    controls={false}
                    className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
                  />
                ) : (
                  <div className="w-72 h-96 rounded-2xl bg-gradient-to-br from-purple-700 via-indigo-800 to-black flex flex-col items-center justify-center p-6 text-center text-white border border-purple-500/30">
                    <span className="text-5xl mb-4">🟣</span>
                    <p className="font-bold text-lg">Snap Video</p>
                    <p className="text-xs text-white/70 mt-2">
                      Ephemeral view-once video playing...
                    </p>
                  </div>
                )
              ) : activeSnap.mediaUrl ? (
                <img
                  src={activeSnap.mediaUrl}
                  alt="Snap"
                  className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
                />
              ) : (
                <div className="w-72 h-96 rounded-2xl bg-gradient-to-br from-red-600 via-rose-700 to-black flex flex-col items-center justify-center p-6 text-center text-white border border-red-500/30">
                  <span className="text-5xl mb-4">🔴</span>
                  <p className="font-bold text-lg">Snap Photo</p>
                  <p className="text-xs text-white/70 mt-2">Ephemeral view-once photo</p>
                </div>
              )}
            </div>

            {/* Bottom prompt */}
            <div
              className="p-4 pb-8 text-center text-xs text-white/60 bg-gradient-to-t from-black/80 to-transparent"
              onClick={(e) => e.stopPropagation()}
            >
              Tap anywhere to close · Snap will auto-destroy in {snapSecondsRemaining}s
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-chat games launcher (bottom sheet) */}
      <AnimatePresence>
        {showGames && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGames(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-t-2xl bg-[var(--quant-background)] p-4 pb-6"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', ...spring.stiff }}
              onClick={(e) => e.stopPropagation()}
            >
              <GameLauncher
                conversationId={id}
                participantIds={[]}
                currentUserId="self"
                onPostSystemMessage={handlePostSystemMessage}
                onClose={() => setShowGames(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
