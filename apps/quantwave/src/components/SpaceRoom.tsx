'use client';

// ============================================================================
// QuantSync - SpaceRoom Component
// Audio space UI: speakers grid, listeners, hand raise, reactions, controls
// ============================================================================

import React, { useState, useCallback, useEffect } from 'react';

interface Speaker {
  id: string;
  name: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHost: boolean;
  isModerator: boolean;
}

interface Listener {
  id: string;
  name: string;
  avatar: string;
}

interface HandRaise {
  id: string;
  name: string;
  avatar: string;
  raisedAt: string;
}

interface SpaceRoomProps {
  spaceId: string;
  title: string;
  description?: string;
  speakers: Speaker[];
  listeners: Listener[];
  handRaiseQueue: HandRaise[];
  currentUserId: string;
  isHost: boolean;
  isSpeaker: boolean;
  isMicOn: boolean;
  hasRaisedHand: boolean;
  isRecording: boolean;
  onLeave: () => void;
  onToggleMic: () => void;
  onRaiseHand: () => void;
  onReact: (reaction: string) => void;
  onInviteSpeaker?: (userId: string) => void;
  onRemoveSpeaker?: (userId: string) => void;
  onMuteSpeaker?: (userId: string) => void;
  onEndSpace?: () => void;
}

const REACTIONS = ['👏', '🔥', '❤️', '💯', '😂', '🎉', '💡', '🙌'];

const SpaceRoom: React.FC<SpaceRoomProps> = ({
  spaceId,
  title,
  description,
  speakers,
  listeners,
  handRaiseQueue,
  currentUserId,
  isHost,
  isSpeaker,
  isMicOn,
  hasRaisedHand,
  isRecording,
  onLeave,
  onToggleMic,
  onRaiseHand,
  onReact,
  onInviteSpeaker,
  onRemoveSpeaker,
  onMuteSpeaker,
  onEndSpace,
}) => {
  const [showReactions, setShowReactions] = useState<boolean>(false);
  const [activeReactions, setActiveReactions] = useState<
    { id: string; emoji: string; x: number }[]
  >([]);
  const [showSpeakerMenu, setShowSpeakerMenu] = useState<string | null>(null);
  const [showListeners, setShowListeners] = useState<boolean>(false);
  const [showShareLink, setShowShareLink] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsedTime((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleReact = useCallback(
    (reaction: string) => {
      onReact(reaction);
      const id = `${Date.now()}_${Math.random()}`;
      const x = Math.random() * 80 + 10;
      setActiveReactions((prev) => [...prev, { id, emoji: reaction, x }]);
      setTimeout(() => setActiveReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
    },
    [onReact],
  );

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/spaces/${spaceId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [spaceId]);

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950 text-white flex flex-col">
      <div className="relative overflow-hidden flex-1">
        {activeReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-20 text-2xl animate-bounce opacity-0"
            style={{ left: `${r.x}%`, animation: 'float-up 2s ease-out forwards' }}
          >
            {r.emoji}
          </div>
        ))}

        <header className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRecording && (
              <span className="flex items-center gap-1 text-red-400 text-xs">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                REC
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDuration(elapsedTime)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShareLink(true)}
              className="text-xs text-gray-300 hover:text-white dark:text-gray-400 dark:hover:text-white bg-white/10 dark:bg-white/5 px-3 py-1 rounded-full"
            >
              Share
            </button>
            <button
              onClick={onLeave}
              className="text-xs text-gray-300 hover:text-white dark:text-gray-400 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="px-4 mb-6">
          <h1 className="text-lg font-bold">{title}</h1>
          {description && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{description}</p>
          )}
        </div>

        <section className="px-4 mb-6">
          <h3 className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
            Speakers ({speakers.length})
          </h3>
          <div className="grid grid-cols-4 gap-4">
            {speakers.map((speaker) => (
              <div key={speaker.id} className="flex flex-col items-center relative">
                <div
                  className="relative"
                  onClick={() =>
                    isHost && speaker.id !== currentUserId ? setShowSpeakerMenu(speaker.id) : null
                  }
                >
                  <div
                    className={`w-16 h-16 rounded-full overflow-hidden ${speaker.isSpeaking ? 'ring-3 ring-green-400 ring-offset-2 ring-offset-gray-900 dark:ring-offset-gray-950' : ''}`}
                  >
                    <img
                      src={speaker.avatar}
                      alt={speaker.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {speaker.isMuted && (
                    <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center">
                      <span className="text-xs">🔇</span>
                    </div>
                  )}
                  {speaker.isSpeaking && !speaker.isMuted && (
                    <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full w-4 h-4 animate-pulse" />
                  )}
                  {speaker.isHost && (
                    <div className="absolute -top-1 -left-1 bg-yellow-500 rounded-full w-4 h-4 flex items-center justify-center text-xs">
                      ⭐
                    </div>
                  )}
                </div>
                <span className="text-xs mt-1.5 text-center truncate w-full">{speaker.name}</span>
                {showSpeakerMenu === speaker.id && isHost && (
                  <div className="absolute top-full mt-1 bg-gray-800 dark:bg-gray-900 rounded-lg py-1 w-32 z-10 shadow-lg">
                    <button
                      onClick={() => {
                        onMuteSpeaker?.(speaker.id);
                        setShowSpeakerMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 dark:hover:bg-gray-800"
                    >
                      {speaker.isMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      onClick={() => {
                        onRemoveSpeaker?.(speaker.id);
                        setShowSpeakerMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 dark:hover:bg-gray-800 text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {isHost && handRaiseQueue.length > 0 && (
          <section className="px-4 mb-6 bg-white/5 dark:bg-white/[0.03] rounded-xl mx-4 p-3">
            <h3 className="text-xs text-yellow-400 uppercase tracking-wide mb-2">
              Hand Raised ({handRaiseQueue.length})
            </h3>
            <div className="space-y-2">
              {handRaiseQueue.map((person) => (
                <div key={person.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={person.avatar} alt="" className="w-8 h-8 rounded-full" />
                    <span className="text-sm">{person.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(person.raisedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    onClick={() => onInviteSpeaker?.(person.id)}
                    className="text-xs bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 px-3 py-1 rounded-full"
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="px-4 mb-6">
          <button
            onClick={() => setShowListeners(!showListeners)}
            className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1"
          >
            Listeners ({listeners.length}) {showListeners ? '▼' : '▶'}
          </button>
          {showListeners && (
            <div className="flex flex-wrap gap-2">
              {listeners.slice(0, 30).map((listener) => (
                <div key={listener.id} className="flex flex-col items-center">
                  <img
                    src={listener.avatar}
                    alt={listener.name}
                    className="w-10 h-10 rounded-full"
                    title={listener.name}
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate w-12 text-center">
                    {listener.name.split(' ')[0]}
                  </span>
                </div>
              ))}
              {listeners.length > 30 && (
                <div className="w-10 h-10 rounded-full bg-gray-700 dark:bg-gray-800 flex items-center justify-center text-xs">
                  +{listeners.length - 30}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="sticky bottom-0 bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur border-t border-gray-700 dark:border-gray-800 p-4">
        {showReactions && (
          <div className="flex justify-center gap-2 mb-3 flex-wrap">
            {REACTIONS.map((r) => (
              <button
                key={r}
                onClick={() => handleReact(r)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 flex items-center justify-center text-lg transition-transform hover:scale-110"
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="px-4 py-2 rounded-full bg-white/10 dark:bg-white/5 text-sm"
          >
            {showReactions ? '✕' : '😀'}
          </button>
          <div className="flex items-center gap-3">
            {isSpeaker ? (
              <button
                onClick={onToggleMic}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-colors ${isMicOn ? 'bg-white text-gray-900' : 'bg-red-500 text-white'}`}
              >
                {isMicOn ? '🎙️' : '🔇'}
              </button>
            ) : (
              <button
                onClick={onRaiseHand}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-xl ${hasRaisedHand ? 'bg-yellow-500 animate-bounce' : 'bg-white/10 dark:bg-white/5'}`}
              >
                ✋
              </button>
            )}
          </div>
          <button
            onClick={onLeave}
            className="px-4 py-2 rounded-full bg-red-500/80 hover:bg-red-500 text-sm font-medium"
          >
            Leave
          </button>
        </div>
        {isHost && (
          <div className="flex justify-center mt-3">
            <button onClick={onEndSpace} className="text-xs text-red-400 hover:text-red-300">
              End Space for Everyone
            </button>
          </div>
        )}
      </div>

      {showShareLink && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowShareLink(false)}
        >
          <div
            className="bg-gray-800 dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold mb-3">Share Space</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/spaces/${spaceId}`}
                readOnly
                className="flex-1 bg-gray-700 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-purple-500 dark:bg-purple-600 rounded-lg text-sm"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpaceRoom;
