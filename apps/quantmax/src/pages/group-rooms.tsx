// ============================================================================
// QuantMax - Group Video Rooms
// Room browser, create room form, join room, in-room 2x4 video grid
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useGroupRooms } from '../hooks/useGroupRooms';

type PageView = 'browse' | 'in_room';

const GroupRoomsPage: React.FC = () => {
  const {
    rooms,
    currentRoom,
    chat,
    isInRoom,
    isLoading,
    loadRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    toggleMute,
    toggleCamera,
  } = useGroupRooms('current-user');
  const [view, setView] = useState<PageView>('browse');
  const [messageInput, setMessageInput] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [createTopic, setCreateTopic] = useState<string>('');
  const [createMaxParticipants, setCreateMaxParticipants] = useState<number>(8);
  const [createIsPrivate, setCreateIsPrivate] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [showChat, setShowChat] = useState<boolean>(true);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadRooms();
  }, []);
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);
  useEffect(() => {
    if (isInRoom) setView('in_room');
  }, [isInRoom]);

  const handleJoinRoom = useCallback(
    async (roomId: string) => {
      const success = await joinRoom(roomId);
      if (success) setView('in_room');
    },
    [joinRoom],
  );

  const handleLeaveRoom = useCallback(() => {
    leaveRoom();
    setView('browse');
  }, [leaveRoom]);

  const handleCreateRoom = useCallback(async () => {
    if (!createTopic.trim()) return;
    await createRoom(createTopic, createMaxParticipants, createIsPrivate, []);
    setShowCreateForm(false);
    setCreateTopic('');
    setView('in_room');
  }, [createTopic, createMaxParticipants, createIsPrivate, createRoom]);

  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim()) return;
    sendMessage(messageInput);
    setMessageInput('');
  }, [messageInput, sendMessage]);

  const filteredRooms = useMemo(() => {
    let result = rooms;
    if (searchQuery)
      result = result.filter((r) => r.topic.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterTag) result = result.filter((r) => r.tags.includes(filterTag));
    return result;
  }, [rooms, searchQuery, filterTag]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    rooms.forEach((r) => r.tags.forEach((t) => tags.add(t)));
    return Array.from(tags);
  }, [rooms]);

  if (isLoading && rooms.length === 0) {
    return <LoadingState variant="skeleton" text="Loading rooms..." />;
  }

  if (view === 'in_room' && currentRoom) {
    return (
      <div className="group-rooms-page in-room">
        <div className="room-header">
          <button className="leave-room-btn" onClick={handleLeaveRoom}>
            &larr; Leave
          </button>
          <div className="room-title-area">
            <h2 className="room-topic">{currentRoom.topic}</h2>
            <div className="room-meta">
              <span className="participant-count">
                {currentRoom.participants.length}/{currentRoom.maxParticipants}
              </span>
              <span className="spectator-count">👁 {currentRoom.spectators} watching</span>
            </div>
          </div>
        </div>
        <div className="video-grid-2x4">
          {Array.from({ length: 8 }, (_, i) => {
            const participant = currentRoom.participants[i] || null;
            return (
              <div key={i} className={`grid-cell ${participant ? 'occupied' : 'empty'}`}>
                {participant ? (
                  <div className="participant-video">
                    <div className="participant-label">
                      <span className="participant-name">{participant.name}</span>
                      {participant.isHost && <span className="host-badge">Host</span>}
                      {participant.isMuted && <span className="muted-icon">🔇</span>}
                    </div>
                  </div>
                ) : (
                  <div className="empty-slot">
                    <span className="empty-icon">+</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="room-controls">
          <button className="room-control" onClick={toggleMute}>
            <span>🎤</span>
          </button>
          <button className="room-control" onClick={toggleCamera}>
            <span>📹</span>
          </button>
          <button className="room-control chat-toggle" onClick={() => setShowChat(!showChat)}>
            <span>💬</span>
          </button>
          <button className="room-control leave" onClick={handleLeaveRoom}>
            <span>Leave</span>
          </button>
        </div>
        {showChat && (
          <div className="room-chat-panel">
            <div className="room-messages">
              {chat.map((msg) => (
                <div
                  key={msg.id}
                  className={`room-message ${msg.userId === 'system' ? 'system' : ''}`}
                >
                  <span className="msg-username">{msg.userName}:</span>
                  <span className="msg-text">{msg.message}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="room-chat-input">
              <input
                className="chat-input"
                placeholder="Type a message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button className="send-btn" onClick={handleSendMessage}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group-rooms-page browse">
      <div className="rooms-header">
        <h1 className="page-title">Group Rooms</h1>
        <button className="create-room-btn" onClick={() => setShowCreateForm(true)}>
          + Create Room
        </button>
      </div>
      <div className="rooms-search">
        <input
          className="search-input"
          placeholder="Search rooms..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="tag-filters">
        <button
          className={`tag-filter ${filterTag === '' ? 'active' : ''}`}
          onClick={() => setFilterTag('')}
        >
          All
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            className={`tag-filter ${filterTag === tag ? 'active' : ''}`}
            onClick={() => setFilterTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="rooms-grid">
        {filteredRooms.length === 0 ? (
          <EmptyState title="No rooms found" description="Create one to get started!" />
        ) : (
          filteredRooms.map((room) => (
            <div key={room.id} className="room-card">
              <div className="room-card-header">
                <h3 className="room-card-topic">{room.topic}</h3>
                {room.isPrivate && <span className="private-badge">Private</span>}
              </div>
              <div className="room-card-stats">
                <span className="participants-badge">
                  {room.participants.length}/{room.maxParticipants}
                </span>
                <span className="spectators-badge">👁 {room.spectators}</span>
              </div>
              <div className="room-card-tags">
                {room.tags.map((tag) => (
                  <span key={tag} className="room-tag">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="room-card-footer">
                <button className="join-room-btn" onClick={() => handleJoinRoom(room.id)}>
                  Join
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {showCreateForm && (
        <div className="create-room-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="create-room-form" onClick={(e) => e.stopPropagation()}>
            <h2>Create a Room</h2>
            <div className="form-field">
              <label>Topic</label>
              <input
                className="field-input"
                value={createTopic}
                onChange={(e) => setCreateTopic(e.target.value)}
                placeholder="What is this room about?"
              />
            </div>
            <div className="form-field">
              <label>Max Participants: {createMaxParticipants}</label>
              <input
                type="range"
                min="2"
                max="8"
                value={createMaxParticipants}
                onChange={(e) => setCreateMaxParticipants(Number(e.target.value))}
              />
            </div>
            <div className="form-field">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={createIsPrivate}
                  onChange={(e) => setCreateIsPrivate(e.target.checked)}
                />
                Private Room
              </label>
            </div>
            <div className="form-actions">
              <button className="cancel-btn" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleCreateRoom}
                disabled={!createTopic.trim()}
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupRoomsPage;
