// ============================================================================
// QuantSync - Audio Spaces Page
// Live audio rooms, create space, join/leave, speaker grid, reactions
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface Space {
  id: string;
  title: string;
  description: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  speakers: { id: string; name: string; avatar: string; isSpeaking: boolean }[];
  listenerCount: number;
  isLive: boolean;
  scheduledAt?: string;
  topics: string[];
  isRecording: boolean;
  createdAt: string;
}

interface CreateSpaceForm {
  title: string;
  description: string;
  topics: string[];
  isScheduled: boolean;
  scheduledDate: string;
  scheduledTime: string;
}

interface ActiveSpace {
  id: string;
  title: string;
  speakers: { id: string; name: string; avatar: string; isSpeaking: boolean; isMuted: boolean }[];
  listeners: { id: string; name: string; avatar: string }[];
  handRaiseQueue: { id: string; name: string; avatar: string; raisedAt: string }[];
  reactions: { type: string; count: number }[];
  isMicOn: boolean;
  isHost: boolean;
  isSpeaker: boolean;
  hasRaisedHand: boolean;
}

const REACTIONS = ['👏', '🔥', '❤️', '💯', '😂', '🎉'];

const SpacesPage: React.FC = () => {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [scheduledSpaces, setScheduledSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [activeSpace, setActiveSpace] = useState<ActiveSpace | null>(null);
  const [createForm, setCreateForm] = useState<CreateSpaceForm>({
    title: '',
    description: '',
    topics: [],
    isScheduled: false,
    scheduledDate: '',
    scheduledTime: '',
  });
  const [creating, setCreating] = useState<boolean>(false);
  const [topicInput, setTopicInput] = useState<string>('');
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});

  const fetchSpaces = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/spaces');
      if (!res.ok) throw new Error('Failed to load spaces');
      const data = await res.json();
      setSpaces(data.live || []);
      setScheduledSpaces(data.scheduled || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpaces();
    const interval = setInterval(fetchSpaces, 30000);
    return () => clearInterval(interval);
  }, [fetchSpaces]);

  const handleJoinSpace = useCallback(async (spaceId: string) => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/join`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to join space');
      const data = await res.json();
      setActiveSpace(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const handleLeaveSpace = useCallback(async () => {
    if (!activeSpace) return;
    try {
      await fetch(`/api/spaces/${activeSpace.id}/leave`, { method: 'POST' });
      setActiveSpace(null);
    } catch {}
  }, [activeSpace]);

  const toggleMic = useCallback(async () => {
    if (!activeSpace) return;
    setActiveSpace((prev) => (prev ? { ...prev, isMicOn: !prev.isMicOn } : null));
    await fetch(`/api/spaces/${activeSpace.id}/mic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted: activeSpace.isMicOn }),
    });
  }, [activeSpace]);

  const raiseHand = useCallback(async () => {
    if (!activeSpace) return;
    setActiveSpace((prev) => (prev ? { ...prev, hasRaisedHand: !prev.hasRaisedHand } : null));
    await fetch(`/api/spaces/${activeSpace.id}/hand`, { method: 'POST' });
  }, [activeSpace]);

  const sendReaction = useCallback(
    async (reaction: string) => {
      if (!activeSpace) return;
      setReactionCounts((prev) => ({ ...prev, [reaction]: (prev[reaction] || 0) + 1 }));
      await fetch(`/api/spaces/${activeSpace.id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
      setTimeout(
        () =>
          setReactionCounts((prev) => ({
            ...prev,
            [reaction]: Math.max(0, (prev[reaction] || 0) - 1),
          })),
        3000,
      );
    },
    [activeSpace],
  );

  const handleCreateSpace = useCallback(async () => {
    if (!createForm.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error('Failed to create space');
      const data = await res.json();
      setShowCreateModal(false);
      setCreateForm({
        title: '',
        description: '',
        topics: [],
        isScheduled: false,
        scheduledDate: '',
        scheduledTime: '',
      });
      if (!createForm.isScheduled) {
        setActiveSpace(data);
      }
      fetchSpaces();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }, [createForm, fetchSpaces]);

  const addTopic = useCallback(() => {
    if (topicInput.trim() && createForm.topics.length < 5) {
      setCreateForm((prev) => ({ ...prev, topics: [...prev.topics, topicInput.trim()] }));
      setTopicInput('');
    }
  }, [topicInput, createForm.topics]);

  if (loading && spaces.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
        <span className="ml-3 text-gray-500">Loading spaces...</span>
      </div>
    );
  }

  if (error && spaces.length === 0 && !activeSpace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load spaces</div>
        <button onClick={fetchSpaces} className="px-6 py-2 bg-purple-500 text-white rounded-full">
          Retry
        </button>
      </div>
    );
  }

  if (activeSpace) {
    return (
      <div className="max-w-2xl mx-auto min-h-screen bg-gradient-to-b from-purple-900 to-gray-900 text-white p-4">
        <div className="flex items-center justify-between mb-6">
          <button onClick={handleLeaveSpace} className="text-sm text-gray-300 hover:text-white">
            Leave quietly
          </button>
          <h2 className="font-bold text-lg text-center flex-1 px-4">{activeSpace.title}</h2>
          <button className="text-gray-300 hover:text-white">⋯</button>
        </div>

        <section className="mb-6">
          <h3 className="text-sm text-gray-400 mb-3">Speakers</h3>
          <div className="grid grid-cols-3 gap-4">
            {activeSpace.speakers.map((speaker) => (
              <div key={speaker.id} className="flex flex-col items-center">
                <div
                  className={`relative w-16 h-16 rounded-full ${speaker.isSpeaking ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-900' : ''}`}
                >
                  <img
                    src={speaker.avatar}
                    alt={speaker.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                  {speaker.isMuted && (
                    <span className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-0.5 text-xs">
                      🔇
                    </span>
                  )}
                  {speaker.isSpeaking && (
                    <span className="absolute -bottom-1 -right-1 bg-green-500 rounded-full w-3 h-3 animate-pulse" />
                  )}
                </div>
                <span className="text-xs mt-1 text-center truncate w-full">{speaker.name}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-sm text-gray-400 mb-2">Listeners ({activeSpace.listeners.length})</h3>
          <div className="flex flex-wrap gap-2">
            {activeSpace.listeners.slice(0, 20).map((listener) => (
              <img
                key={listener.id}
                src={listener.avatar}
                alt={listener.name}
                className="w-10 h-10 rounded-full"
                title={listener.name}
              />
            ))}
            {activeSpace.listeners.length > 20 && (
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                +{activeSpace.listeners.length - 20}
              </div>
            )}
          </div>
        </section>

        {activeSpace.handRaiseQueue.length > 0 && activeSpace.isHost && (
          <section className="mb-6 bg-white/10 rounded-xl p-3">
            <h3 className="text-sm font-medium mb-2">
              Hand Raised ({activeSpace.handRaiseQueue.length})
            </h3>
            {activeSpace.handRaiseQueue.map((person) => (
              <div key={person.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <img src={person.avatar} alt="" className="w-8 h-8 rounded-full" />
                  <span className="text-sm">{person.name}</span>
                </div>
                <button className="text-xs bg-purple-500 px-2 py-1 rounded-full">
                  Invite to speak
                </button>
              </div>
            ))}
          </section>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-2">
                {REACTIONS.map((reaction) => (
                  <button
                    key={reaction}
                    onClick={() => sendReaction(reaction)}
                    className="relative w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
                  >
                    {reaction}
                    {(reactionCounts[reaction] || 0) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                        {reactionCounts[reaction]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              {activeSpace.isSpeaker && (
                <button
                  onClick={toggleMic}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-xl ${activeSpace.isMicOn ? 'bg-white text-gray-900' : 'bg-red-500 text-white'}`}
                >
                  {activeSpace.isMicOn ? '🎙️' : '🔇'}
                </button>
              )}
              {!activeSpace.isSpeaker && (
                <button
                  onClick={raiseHand}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-xl ${activeSpace.hasRaisedHand ? 'bg-yellow-500' : 'bg-white/10'}`}
                >
                  ✋
                </button>
              )}
              <button
                onClick={handleLeaveSpace}
                className="px-6 py-3 bg-red-500 rounded-full font-medium"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Spaces</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-purple-500 text-white rounded-full text-sm font-medium hover:bg-purple-600"
        >
          + Create Space
        </button>
      </header>

      {spaces.length > 0 && (
        <section className="px-4 py-4">
          <h2 className="font-bold text-lg mb-3">🔴 Live Now</h2>
          <div className="space-y-3">
            {spaces.map((space) => (
              <div
                key={space.id}
                className="border rounded-xl p-4 bg-gradient-to-br from-purple-50 to-pink-50 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold">{space.title}</h3>
                    <p className="text-sm text-gray-600 line-clamp-1">{space.description}</p>
                  </div>
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
                    LIVE
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <img src={space.hostAvatar} alt="" className="w-6 h-6 rounded-full" />
                  <span className="text-sm text-gray-700">{space.hostName}</span>
                  {space.isRecording && <span className="text-xs text-red-500">● REC</span>}
                </div>
                <div className="flex items-center gap-1 mb-3">
                  {space.speakers.slice(0, 5).map((s) => (
                    <img
                      key={s.id}
                      src={s.avatar}
                      alt={s.name}
                      className="w-7 h-7 rounded-full border-2 border-white -ml-1 first:ml-0"
                    />
                  ))}
                  <span className="text-xs text-gray-500 ml-2">
                    {space.speakers.length} speakers, {space.listenerCount} listening
                  </span>
                </div>
                {space.topics.length > 0 && (
                  <div className="flex gap-1 mb-3">
                    {space.topics.map((topic) => (
                      <span
                        key={topic}
                        className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => handleJoinSpace(space.id)}
                  className="w-full py-2 bg-purple-500 text-white rounded-full font-medium hover:bg-purple-600"
                >
                  Join Space
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {scheduledSpaces.length > 0 && (
        <section className="px-4 py-4 border-t">
          <h2 className="font-bold text-lg mb-3">📅 Scheduled</h2>
          <div className="space-y-3">
            {scheduledSpaces.map((space) => (
              <div key={space.id} className="border rounded-xl p-4">
                <h3 className="font-bold">{space.title}</h3>
                <p className="text-sm text-gray-600">{space.description}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm text-gray-500">
                    {space.scheduledAt ? new Date(space.scheduledAt).toLocaleString() : ''}
                  </span>
                  <button className="px-4 py-1 border border-purple-500 text-purple-500 rounded-full text-sm">
                    Remind me
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {spaces.length === 0 && scheduledSpaces.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🎙️</div>
          <h3 className="text-xl font-semibold text-gray-700">No spaces right now</h3>
          <p className="text-gray-500 mt-2">Create one and start the conversation!</p>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Create Space</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-500 text-xl">
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="What do you want to talk about?"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 min-h-[60px]"
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Topics</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    placeholder="Add topic"
                    onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                  />
                  <button
                    onClick={addTopic}
                    className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {createForm.topics.map((t, i) => (
                    <span
                      key={i}
                      className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs flex items-center gap-1"
                    >
                      {t}
                      <button
                        onClick={() =>
                          setCreateForm((f) => ({
                            ...f,
                            topics: f.topics.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="text-purple-500"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="schedule"
                  checked={createForm.isScheduled}
                  onChange={(e) => setCreateForm((f) => ({ ...f, isScheduled: e.target.checked }))}
                />
                <label htmlFor="schedule" className="text-sm">
                  Schedule for later
                </label>
              </div>
              {createForm.isScheduled && (
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={createForm.scheduledDate}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, scheduledDate: e.target.value }))
                    }
                    className="border rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={createForm.scheduledTime}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, scheduledTime: e.target.value }))
                    }
                    className="border rounded px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 border rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSpace}
                disabled={creating || !createForm.title.trim()}
                className="flex-1 py-2 bg-purple-500 text-white rounded-full font-medium disabled:opacity-50"
              >
                {creating ? 'Creating...' : createForm.isScheduled ? 'Schedule' : 'Start Space'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpacesPage;
