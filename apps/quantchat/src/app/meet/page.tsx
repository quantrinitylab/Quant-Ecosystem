'use client';

// ============================================================================
// QuantChat - QuantMeet Lobby (C08.1)
// ============================================================================
//
// Real backend, no fabricated meetings: "Start instant meeting" creates a
// real room via POST /meetings/rooms; "Join with code" resolves a real room;
// "Recent meetings" lists only the caller's own rooms from GET /meetings/rooms.
// There is intentionally no "explore/discover" list — no fake meetings.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppShell,
  TopBar,
  BottomNav,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@quant/shared-ui';
import { navItems, routes } from '../../lib/navigation';
import { apiClient, type MeetingRoomSummary } from '../../services/api-client';

const DEFAULT_SETTINGS = {
  maxParticipants: 50,
  waitingRoom: false,
  muteOnEntry: false,
  allowScreenShare: true,
  enableRecording: false,
  enableTranscript: false,
};

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MeetLobbyPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<MeetingRoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadRooms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.listMeetingRooms();
      if (res.success && res.data) {
        setRooms(res.data);
      } else {
        setError(res.error?.message ?? 'Could not load meetings.');
      }
    } catch {
      setError('Could not load meetings. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const handleStartInstant = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await apiClient.createMeetingRoom({
        name: `Meeting ${new Date().toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        settings: DEFAULT_SETTINGS,
      });
      if (res.success && res.data) {
        router.push(`${routes.meet}/${encodeURIComponent(res.data.id)}`);
      } else {
        setError(res.error?.message ?? 'Could not start the meeting.');
      }
    } catch {
      setError('Could not start the meeting. Check your connection and retry.');
    } finally {
      setIsCreating(false);
    }
  }, [router]);

  const handleJoinCode = useCallback(() => {
    const code = joinCode.trim();
    if (!code) return;
    router.push(`${routes.meet}/${encodeURIComponent(code)}`);
  }, [joinCode, router]);

  return (
    <AppShell>
      <TopBar title="QuantMeet" />
      <main className="flex-1 overflow-y-auto px-4 py-4">
        {/* Primary action: start instant meeting */}
        <button
          type="button"
          onClick={() => void handleStartInstant()}
          disabled={isCreating}
          className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          data-testid="start-instant-meeting"
        >
          {isCreating ? 'Starting…' : 'Start instant meeting'}
        </button>

        {/* Secondary: join with link/code */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoinCode();
            }}
            placeholder="Enter meeting code"
            aria-label="Meeting code"
            className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            data-testid="join-code-input"
          />
          <button
            type="button"
            onClick={handleJoinCode}
            disabled={!joinCode.trim()}
            className="rounded-xl bg-gray-200 px-5 py-3 text-base font-semibold text-gray-900 transition-colors hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            data-testid="join-code-button"
          >
            Join
          </button>
        </div>

        {/* Recent meetings — real rooms only */}
        <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Recent meetings
        </h2>
        {isLoading ? (
          <LoadingState variant="skeleton" text="Loading meetings…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void loadRooms()} />
        ) : rooms.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            description="Start an instant meeting or join one with a code."
          />
        ) : (
          <ul className="mt-3 space-y-2" data-testid="recent-meetings">
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => router.push(`${routes.meet}/${encodeURIComponent(room.id)}`)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                >
                  <span className="block text-base font-medium text-gray-900 dark:text-gray-100">
                    {room.name}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500 dark:text-gray-400">
                    {room.participants.length} participant
                    {room.participants.length === 1 ? '' : 's'} · {formatTime(room.createdAt)} ·{' '}
                    {room.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomNav
        items={navItems}
        activeId="chats"
        onChange={(id) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />
    </AppShell>
  );
}
