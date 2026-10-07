// ============================================================================
// QuantMax - Live Streaming
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EmptyState } from '@quant/shared-ui';
import { useLive } from '../hooks/useLive';

const GIFT_CATALOG = [
  { id: 'g1', name: 'Rose', icon: '🌹', diamondCost: 1 },
  { id: 'g2', name: 'Heart', icon: '💖', diamondCost: 5 },
  { id: 'g3', name: 'Star', icon: '⭐', diamondCost: 10 },
  { id: 'g4', name: 'Fireworks', icon: '🎆', diamondCost: 50 },
  { id: 'g5', name: 'Crown', icon: '👑', diamondCost: 100 },
  { id: 'g6', name: 'Diamond', icon: '💎', diamondCost: 500 },
];

const CATEGORIES = [
  'Just Chatting',
  'Music',
  'Dance',
  'Gaming',
  'Cooking',
  'Art',
  'Fitness',
  'Q&A',
];

const LiveStreamPage: React.FC = () => {
  const {
    stream,
    chat,
    topGifters,
    isStreaming,
    startStream,
    endStream,
    updateSettings,
    sendChat,
    settings,
  } = useLive('current-user');
  const [showGoLiveForm, setShowGoLiveForm] = useState<boolean>(false);
  const [commentInput, setCommentInput] = useState<string>('');
  const [showGiftPanel, setShowGiftPanel] = useState<boolean>(false);
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [diamondBalance] = useState<number>(2500);
  const commentsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (commentsEndRef.current) commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const handleGoLive = useCallback(() => {
    if (!settings.title.trim()) return;
    startStream(settings.title, settings.category);
    setShowGoLiveForm(false);
  }, [settings, startStream]);

  const handleSendComment = useCallback(() => {
    if (!commentInput.trim()) return;
    sendChat(commentInput);
    setCommentInput('');
  }, [commentInput, sendChat]);

  const formatDuration = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  if (!isStreaming && !showGoLiveForm) {
    return (
      <div className="live-page idle">
        <div className="live-header">
          <h1 className="live-title">Live</h1>
          <div className="diamond-balance">
            <span className="diamond-icon">💎</span>
            <span className="diamond-count">{diamondBalance.toLocaleString()}</span>
          </div>
        </div>
        <button className="go-live-btn" onClick={() => setShowGoLiveForm(true)}>
          <span className="go-live-icon">📡</span>
          <span className="go-live-text">Go Live</span>
        </button>
        <div className="live-streams-section">
          <h3>Live Now</h3>
          <EmptyState title="No live streams" description="Be the first to go live!" />
        </div>
      </div>
    );
  }

  if (showGoLiveForm) {
    return (
      <div className="live-page go-live-form">
        <div className="form-header">
          <button className="back-btn" onClick={() => setShowGoLiveForm(false)}>
            &larr;
          </button>
          <h2>Go Live</h2>
        </div>
        <div className="form-body">
          <div className="form-field">
            <label>Stream Title</label>
            <input
              className="title-input"
              placeholder="Give your stream a title..."
              value={settings.title}
              onChange={(e) => updateSettings({ title: e.target.value })}
              maxLength={100}
            />
          </div>
          <div className="form-field">
            <label>Category</label>
            <div className="category-options">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`category-btn ${settings.category === cat ? 'active' : ''}`}
                  onClick={() => updateSettings({ category: cat })}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <button
            className="start-stream-btn"
            onClick={handleGoLive}
            disabled={!settings.title.trim()}
          >
            Start Live Stream
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="live-page streaming">
      <div className="stream-video-area">
        <div className="video-gradient-overlay" />
        <div className="viewer-count-badge">
          <span className="live-dot" />
          <span className="viewer-number">
            {(stream?.viewerCount || 0).toLocaleString()} watching
          </span>
        </div>
        <div className="stream-duration-badge">
          <span>
            {formatDuration(
              stream ? Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000) : 0,
            )}
          </span>
        </div>
        <div className="stream-diamond-display">
          <span className="diamond-icon">💎</span>
          <span className="diamond-amount">{diamondBalance.toLocaleString()}</span>
        </div>
      </div>

      {showLeaderboard && (
        <div className="leaderboard-sidebar">
          <div className="leaderboard-header">
            <h3>Top Gifters</h3>
            <button className="close-leaderboard" onClick={() => setShowLeaderboard(false)}>
              &#10005;
            </button>
          </div>
          <div className="leaderboard-list">
            {topGifters.map((gifter, idx) => (
              <div key={gifter.userId} className="gifter-item">
                <span className="gifter-rank">#{idx + 1}</span>
                <span className="gifter-name">{gifter.name}</span>
                <span className="gifter-diamonds">💎 {gifter.diamonds.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="live-chat-section">
        <div className="chat-messages-live">
          {chat.slice(-30).map((comment) => (
            <div key={comment.id} className="live-comment">
              <span className="comment-user">{comment.userName}</span>
              <span className="comment-text">{comment.message}</span>
            </div>
          ))}
          <div ref={commentsEndRef} />
        </div>
        <div className="chat-input-row">
          <input
            className="live-chat-input"
            placeholder="Say something..."
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
          />
          <button className="gift-toggle-btn" onClick={() => setShowGiftPanel(!showGiftPanel)}>
            🎁
          </button>
          <button
            className="leaderboard-toggle"
            onClick={() => setShowLeaderboard(!showLeaderboard)}
          >
            🏆
          </button>
        </div>
      </div>

      {showGiftPanel && (
        <div className="gift-panel">
          <div className="gift-panel-header">
            <h4>Send a Gift</h4>
            <span className="my-diamonds">💎 {diamondBalance.toLocaleString()}</span>
          </div>
          <div className="gift-grid">
            {GIFT_CATALOG.map((gift) => (
              <button
                key={gift.id}
                className="gift-btn"
                disabled={diamondBalance < gift.diamondCost}
              >
                <span className="gift-icon">{gift.icon}</span>
                <span className="gift-name">{gift.name}</span>
                <span className="gift-cost">💎 {gift.diamondCost}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="stream-controls-bar">
        <button
          className="stream-control"
          onClick={() => updateSettings({ isMuted: !settings.isMuted })}
        >
          <span>{settings.isMuted ? '🔇' : '🎤'}</span>
        </button>
        <button
          className="stream-control"
          onClick={() => updateSettings({ isFlipped: !settings.isFlipped })}
        >
          <span>🔄</span>
        </button>
        <button className="stream-control end-stream" onClick={endStream}>
          <span>End Stream</span>
        </button>
      </div>
    </div>
  );
};

export default LiveStreamPage;
