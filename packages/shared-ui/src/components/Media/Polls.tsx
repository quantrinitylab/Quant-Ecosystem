'use client';
// ============================================================================
// Shared UI - Polls Component
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Room, RoomEvent } from 'livekit-client';

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  isActive: boolean;
}

export interface PollsProps {
  room: Room;
  isHost?: boolean;
  className?: string;
}

export const Polls: React.FC<PollsProps> = ({ room, isHost = false, className = '' }) => {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newOptions, setNewOptions] = useState(['', '']);
  const [votedPolls, setVotedPolls] = useState<Set<string>>(new Set());

  useEffect(() => {
    const decoder = new TextDecoder();
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const text = decoder.decode(payload);
        const parsed = JSON.parse(text);
        if (parsed.type === 'poll-create') {
          setPolls((prev) => [...prev, parsed.poll]);
        }
        if (parsed.type === 'poll-vote') {
          setPolls((prev) =>
            prev.map((p) => {
              if (p.id === parsed.pollId) {
                return {
                  ...p,
                  options: p.options.map((o) =>
                    o.id === parsed.optionId ? { ...o, votes: o.votes + 1 } : o,
                  ),
                };
              }
              return p;
            }),
          );
        }
        if (parsed.type === 'poll-end') {
          setPolls((prev) =>
            prev.map((p) => (p.id === parsed.pollId ? { ...p, isActive: false } : p)),
          );
        }
      } catch {
        // ignore non-poll messages
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  const createPoll = useCallback(() => {
    if (!newQuestion.trim() || newOptions.filter((o) => o.trim()).length < 2) return;

    const poll: Poll = {
      id: `poll-${Date.now()}`,
      question: newQuestion.trim(),
      options: newOptions
        .filter((o) => o.trim())
        .map((text, i) => ({ id: `opt-${i}`, text: text.trim(), votes: 0 })),
      createdBy: room.localParticipant.name || room.localParticipant.identity,
      isActive: true,
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ type: 'poll-create', poll }));
    room.localParticipant.publishData(data, { reliable: true });

    setPolls((prev) => [...prev, poll]);
    setNewQuestion('');
    setNewOptions(['', '']);
    setShowCreate(false);
  }, [room, newQuestion, newOptions]);

  const vote = useCallback(
    (pollId: string, optionId: string) => {
      if (votedPolls.has(pollId)) return;

      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'poll-vote', pollId, optionId }));
      room.localParticipant.publishData(data, { reliable: true });

      setVotedPolls((prev) => new Set(prev).add(pollId));
      setPolls((prev) =>
        prev.map((p) => {
          if (p.id === pollId) {
            return {
              ...p,
              options: p.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
            };
          }
          return p;
        }),
      );
    },
    [room, votedPolls],
  );

  const endPoll = useCallback(
    (pollId: string) => {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'poll-end', pollId }));
      room.localParticipant.publishData(data, { reliable: true });
      setPolls((prev) => prev.map((p) => (p.id === pollId ? { ...p, isActive: false } : p)));
    },
    [room],
  );

  return (
    <div className={`flex flex-col h-full p-4 ${className}`} data-testid="polls">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Polls</h3>
        {isHost && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
            data-testid="create-poll-btn"
          >
            {showCreate ? 'Cancel' : 'Create Poll'}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2" data-testid="poll-create-form">
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Question"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            data-testid="poll-question-input"
          />
          {newOptions.map((opt, i) => (
            <input
              key={i}
              type="text"
              value={opt}
              onChange={(e) => {
                const updated = [...newOptions];
                updated[i] = e.target.value;
                setNewOptions(updated);
              }}
              placeholder={`Option ${i + 1}`}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          ))}
          <button
            onClick={() => setNewOptions([...newOptions, ''])}
            className="text-xs text-blue-600"
          >
            + Add option
          </button>
          <button
            onClick={createPoll}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm"
            data-testid="submit-poll-btn"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
        {polls.map((poll) => {
          const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
          return (
            <div key={poll.id} className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-2">{poll.question}</p>
              <div className="space-y-1">
                {poll.options.map((opt) => {
                  const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => poll.isActive && vote(poll.id, opt.id)}
                      disabled={!poll.isActive || votedPolls.has(poll.id)}
                      className="w-full text-left px-3 py-2 rounded border border-gray-200 text-sm relative overflow-hidden disabled:cursor-default"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-100"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative">
                        {opt.text} {(votedPolls.has(poll.id) || !poll.isActive) && `(${pct}%)`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isHost && poll.isActive && (
                <button
                  onClick={() => endPoll(poll.id)}
                  className="mt-2 text-xs text-red-600"
                  data-testid={`end-poll-${poll.id}`}
                >
                  End Poll
                </button>
              )}
              {!poll.isActive && (
                <p className="mt-2 text-xs text-gray-500">Poll ended - {totalVotes} votes</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
