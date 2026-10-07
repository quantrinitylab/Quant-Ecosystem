// ============================================================================
// QuantChat - Calls Page
// Call history and active calls interface
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { Call, CallType } from '../types';
import { apiClient } from '../services/api-client';

interface CallsPageProps {
  currentUserId: string;
}

export const CallsPage: React.FC<CallsPageProps> = ({ currentUserId }) => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [filter, setFilter] = useState<'all' | 'missed' | 'incoming' | 'outgoing'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCallHistory();
  }, []);

  const loadCallHistory = async () => {
    setLoading(true);
    const response = await apiClient.getCallHistory();
    if (response.success && response.data) {
      setCalls(response.data);
    }
    setLoading(false);
  };

  const handleCall = async (userId: string, type: CallType) => {
    const response = await apiClient.initiateCall({
      participantIds: [userId],
      type,
    });
    if (response.success) {
      window.location.hash = `/calls/${response.data?.callId}`;
    }
  };

  const filteredCalls = calls.filter(call => {
    switch (filter) {
      case 'missed': return call.status === 'missed';
      case 'incoming': return call.initiatorId !== currentUserId;
      case 'outgoing': return call.initiatorId === currentUserId;
      default: return true;
    }
  });

  const getCallIcon = (call: Call): string => {
    if (call.status === 'missed') return '📵';
    if (call.type === 'video') return '📹';
    return '📞';
  };

  const getCallStatusText = (call: Call): string => {
    if (call.status === 'missed') return 'Missed';
    if (call.initiatorId === currentUserId) return 'Outgoing';
    return 'Incoming';
  };

  const getCallDuration = (call: Call): string => {
    if (!call.duration) return '';
    const minutes = Math.floor(call.duration / 60);
    const seconds = call.duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="calls-page">
      <header className="calls-header">
        <button className="back-btn" onClick={() => window.location.hash = '/'}>&#8592;</button>
        <h1>Calls</h1>
        <button className="new-call-btn">📞+</button>
      </header>

      <div className="calls-filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'missed' ? 'active' : ''} onClick={() => setFilter('missed')}>Missed</button>
        <button className={filter === 'incoming' ? 'active' : ''} onClick={() => setFilter('incoming')}>Incoming</button>
        <button className={filter === 'outgoing' ? 'active' : ''} onClick={() => setFilter('outgoing')}>Outgoing</button>
      </div>

      {loading ? (
        <div className="calls-loading">Loading call history...</div>
      ) : (
        <main className="calls-list">
          {filteredCalls.length === 0 ? (
            <div className="empty-state">
              <p>No calls yet</p>
              <p>Start a voice or video call with your friends</p>
            </div>
          ) : (
            filteredCalls.map(call => (
              <div key={call.id} className={`call-item ${call.status === 'missed' ? 'missed' : ''}`}>
                <div className="call-avatar">
                  <span>{getCallIcon(call)}</span>
                </div>
                <div className="call-info">
                  <div className="call-name">
                    {call.participants.filter(p => p.userId !== currentUserId).map(p => p.userId).join(', ') || 'Unknown'}
                    {call.isGroupCall && ' (Group)'}
                  </div>
                  <div className="call-details">
                    <span className={`call-status ${call.status}`}>{getCallStatusText(call)}</span>
                    {call.duration && <span className="call-duration">{getCallDuration(call)}</span>}
                    <span className="call-time">
                      {call.createdAt ? new Date(call.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
                <div className="call-actions">
                  <button
                    className="voice-call-btn"
                    onClick={() => handleCall(call.participants[0]?.userId || '', 'voice')}
                  >
                    📞
                  </button>
                  <button
                    className="video-call-btn"
                    onClick={() => handleCall(call.participants[0]?.userId || '', 'video')}
                  >
                    📹
                  </button>
                </div>
              </div>
            ))
          )}
        </main>
      )}
    </div>
  );
};

export default CallsPage;
