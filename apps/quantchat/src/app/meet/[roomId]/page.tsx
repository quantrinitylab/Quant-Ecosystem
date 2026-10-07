'use client';

// ============================================================================
// QuantChat - QuantMeet Room (C08.2 Join Gate → C08.3 Pre-Meeting Studio →
// C08.4 Active Meeting)
// ============================================================================
//
// Real media only: the join gate resolves a real room from the backend, the
// studio previews the real camera/mic via getUserMedia, and the active
// meeting connects a real livekit-client Room with the server-issued token.
// No fake participants, no simulated tiles — a tile exists only for a real
// LiveKit participant, and every tile renders that participant's real tracks
// (or an honest avatar placeholder when their camera is off).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Room,
  RoomEvent,
  type RemoteParticipant,
  type LocalParticipant,
  ConnectionState,
} from 'livekit-client';
import {
  AppShell,
  TopBar,
  LoadingState,
  ErrorState,
  DevicePicker,
  ParticipantTile,
} from '@quant/shared-ui';
import {
  apiClient,
  type MeetingRoomSummary,
} from '../../../services/api-client';
import { routes } from '../../../lib/navigation';

type Phase = 'loading' | 'gate' | 'studio' | 'joining' | 'meeting';
type DeviceCheck = 'unchecked' | 'checking' | 'ok' | 'denied' | 'unavailable';

export default function MeetRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = typeof params?.roomId === 'string' ? params.roomId : '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [roomInfo, setRoomInfo] = useState<MeetingRoomSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Gate inputs
  const [displayName, setDisplayName] = useState('');
  const [joinMuted, setJoinMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [deviceCheck, setDeviceCheck] = useState<DeviceCheck>('unchecked');

  // Studio
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [micId, setMicId] = useState<string | undefined>(undefined);
  const [micLevel, setMicLevel] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const meterRafRef = useRef<number | null>(null);

  // Active meeting
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [participants, setParticipants] = useState<Array<RemoteParticipant | LocalParticipant>>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // ─── Load room info (join gate resolution) ────────────────────────────────
  useEffect(() => {
    if (!roomId) {
      setError('No meeting code was provided.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.getMeetingRoom(roomId);
        if (cancelled) return;
        if (res.success && res.data) {
          setRoomInfo(res.data);
          setPhase('gate');
        } else if (res.error?.statusCode === 404) {
          setError('Meeting not found. Check the code and try again.');
        } else {
          setError(res.error?.message ?? 'Could not load the meeting.');
        }
      } catch {
        if (!cancelled) setError('Could not load the meeting. Check your connection.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const stopPreview = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
    setMicLevel(0);
  }, []);

  // ─── Device check (gate) + studio preview ────────────────────────────────
  const startPreview = useCallback(async (): Promise<boolean> => {
    stopPreview();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setDeviceCheck('unavailable');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraId ? { deviceId: { exact: cameraId } } : true,
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play().catch(() => undefined);
      }
      // Mic level meter from the real mic track.
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
            setMicLevel(Math.min(1, avg * 2));
            meterRafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      }
      setDeviceCheck('ok');
      return true;
    } catch {
      setDeviceCheck('denied');
      return false;
    }
  }, [cameraId, micId, stopPreview]);

  const handleCheckDevices = useCallback(async () => {
    setDeviceCheck('checking');
    const ok = await startPreview();
    if (ok) setPhase('studio');
  }, [startPreview]);

  // Re-preview when the selected devices change while in the studio.
  useEffect(() => {
    if (phase === 'studio') {
      void startPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, micId]);

  useEffect(() => stopPreview, [stopPreview]);

  // ─── Join the meeting (real LiveKit room) ─────────────────────────────────
  const refreshParticipants = useCallback(() => {
    const list: Array<RemoteParticipant | LocalParticipant> = [];
    if (room.localParticipant) list.push(room.localParticipant);
    room.remoteParticipants.forEach((p) => list.push(p));
    setParticipants(list);
  }, [room]);

  const handleJoin = useCallback(async () => {
    if (!roomInfo) return;
    setPhase('joining');
    setError(null);
    stopPreview();
    try {
      const res = await apiClient.joinMeetingRoom(roomInfo.id, {
        displayName: displayName.trim() || undefined,
        audioEnabled: !joinMuted,
        videoEnabled: !cameraOff,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error?.message ?? 'Could not join the meeting.');
      }
      const { token, serverUrl } = res.data;

      room
        .on(RoomEvent.ParticipantConnected, refreshParticipants)
        .on(RoomEvent.ParticipantDisconnected, refreshParticipants)
        .on(RoomEvent.TrackSubscribed, refreshParticipants)
        .on(RoomEvent.TrackUnsubscribed, refreshParticipants)
        .on(RoomEvent.TrackMuted, refreshParticipants)
        .on(RoomEvent.TrackUnmuted, refreshParticipants)
        .on(RoomEvent.LocalTrackPublished, refreshParticipants)
        .on(RoomEvent.LocalTrackUnpublished, refreshParticipants)
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          setSpeaking(new Set(speakers.map((s) => s.identity)));
          refreshParticipants();
        })
        .on(RoomEvent.Reconnecting, () => {
          setConnectionState(ConnectionState.Reconnecting);
          setNotice('Reconnecting… your media will resume automatically.');
        })
        .on(RoomEvent.Reconnected, () => {
          setConnectionState(ConnectionState.Connected);
          setNotice(null);
          refreshParticipants();
        })
        .on(RoomEvent.Disconnected, () => {
          setConnectionState(ConnectionState.Disconnected);
        });

      setConnectionState(ConnectionState.Connecting);
      await room.connect(serverUrl, token);

      // Honor the selected devices from the studio.
      if (cameraId) await room.switchActiveDevice('videoinput', cameraId).catch(() => undefined);
      if (micId) await room.switchActiveDevice('audioinput', micId).catch(() => undefined);

      await room.localParticipant.setMicrophoneEnabled(!joinMuted);
      await room.localParticipant.setCameraEnabled(!cameraOff);
      setIsMicEnabled(!joinMuted);
      setIsCameraEnabled(!cameraOff);

      setConnectionState(ConnectionState.Connected);
      refreshParticipants();
      setPhase('meeting');
    } catch (e) {
      setConnectionState(ConnectionState.Disconnected);
      setError(e instanceof Error ? e.message : 'Could not join the meeting.');
      setPhase('gate');
    }
  }, [roomInfo, displayName, joinMuted, cameraOff, cameraId, micId, room, refreshParticipants, stopPreview]);

  const handleLeave = useCallback(async () => {
    try {
      room.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      if (roomInfo) await apiClient.leaveMeetingRoom(roomInfo.id);
    } catch {
      /* best-effort leave */
    }
    router.push(routes.meet);
  }, [room, roomInfo, router]);

  const toggleMic = useCallback(async () => {
    const next = !isMicEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setIsMicEnabled(next);
  }, [room, isMicEnabled]);

  const toggleCamera = useCallback(async () => {
    const next = !isCameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setIsCameraEnabled(next);
  }, [room, isCameraEnabled]);

  // Disconnect the LiveKit room if the page unmounts mid-meeting.
  useEffect(() => {
    return () => {
      try {
        room.disconnect();
      } catch {
        /* noop */
      }
      room.removeAllListeners();
    };
  }, [room]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (error && phase !== 'meeting') {
    return (
      <AppShell>
        <TopBar title="QuantMeet" onBack={() => router.push(routes.meet)} />
        <main className="flex flex-1 items-center justify-center px-4">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </main>
      </AppShell>
    );
  }

  if (phase === 'loading' || phase === 'joining') {
    return (
      <AppShell>
        <TopBar title="QuantMeet" onBack={() => router.push(routes.meet)} />
        <main className="flex flex-1 items-center justify-center">
          <LoadingState text={phase === 'joining' ? 'Joining meeting…' : 'Loading meeting…'} />
        </main>
      </AppShell>
    );
  }

  // ── C08.2 Join Gate ──────────────────────────────────────────────────────
  if (phase === 'gate' && roomInfo) {
    return (
      <AppShell>
        <TopBar title="Join meeting" onBack={() => router.push(routes.meet)} />
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{roomInfo.name}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {roomInfo.participants.length} participant
            {roomInfo.participants.length === 1 ? '' : 's'} in the room ·{' '}
            {roomInfo.status === 'active' ? 'Live now' : 'Ended'}
          </p>

          {roomInfo.status !== 'active' && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              This meeting has ended. You can start a new one from the lobby.
            </p>
          )}

          <label className="mt-6 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Your name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How others will see you"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              data-testid="display-name-input"
            />
          </label>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 text-base text-gray-900 dark:text-gray-100">
              <input
                type="checkbox"
                checked={joinMuted}
                onChange={(e) => setJoinMuted(e.target.checked)}
                className="h-5 w-5"
              />
              Join muted
            </label>
            <label className="flex items-center gap-3 text-base text-gray-900 dark:text-gray-100">
              <input
                type="checkbox"
                checked={cameraOff}
                onChange={(e) => setCameraOff(e.target.checked)}
                className="h-5 w-5"
              />
              Camera off
            </label>
          </div>

          {deviceCheck === 'denied' && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              Camera or microphone was blocked. You can still continue — you will join
              audio-only, or allow access in your browser settings and check again.
            </p>
          )}
          {deviceCheck === 'unavailable' && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              This browser does not support camera/microphone access. You can join to
              watch and listen only if the host admits you.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleCheckDevices()}
              disabled={deviceCheck === 'checking' || roomInfo.status !== 'active'}
              className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              data-testid="check-devices-button"
            >
              {deviceCheck === 'checking' ? 'Checking…' : 'Check camera & mic'}
            </button>
            <button
              type="button"
              onClick={() => setPhase('studio')}
              disabled={roomInfo.status !== 'active'}
              className="w-full rounded-2xl bg-gray-200 px-4 py-3 text-base font-semibold text-gray-900 transition-colors hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              Skip device check
            </button>
          </div>
        </main>
      </AppShell>
    );
  }

  // ── C08.3 Pre-Meeting Studio ─────────────────────────────────────────────
  if (phase === 'studio' && roomInfo) {
    return (
      <AppShell>
        <TopBar title="Preview" onBack={() => setPhase('gate')} />
        <main className="flex-1 overflow-y-auto px-4 py-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-gray-900">
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              data-testid="studio-preview"
            />
            {deviceCheck !== 'ok' && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-300">
                No camera preview — your camera is blocked or unavailable. You can still
                join audio-only.
              </div>
            )}
          </div>

          {/* Mic level from the real mic track */}
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Mic</span>
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
              role="meter"
              aria-valuenow={Math.round(micLevel * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Microphone level"
              data-testid="mic-meter"
            >
              <div
                className="h-full rounded-full bg-green-500 transition-[width]"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-4">
            <DevicePicker
              onCameraSelect={setCameraId}
              onMicSelect={setMicId}
              selectedCameraId={cameraId}
              selectedMicId={micId}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleJoin()}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-4 text-base font-semibold text-white transition-colors hover:bg-blue-700"
            data-testid="join-now-button"
          >
            Join now
          </button>
        </main>
      </AppShell>
    );
  }

  // ── C08.4 Active Meeting ─────────────────────────────────────────────────
  return (
    <AppShell>
      <TopBar
        title={roomInfo?.name ?? 'Meeting'}
        onBack={() => void handleLeave()}
      />
      <main className="flex flex-1 flex-col bg-gray-950">
        {notice && (
          <div
            className="bg-amber-500/90 px-4 py-2 text-center text-sm font-medium text-black"
            role="status"
          >
            {notice}
          </div>
        )}
        {connectionState === ConnectionState.Connecting && (
          <div className="flex flex-1 items-center justify-center">
            <LoadingState text="Connecting media…" />
          </div>
        )}
        {connectionState === ConnectionState.Connected && (
          <>
            {/* Participant grid — one tile per REAL participant, real tracks */}
            <div
              className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3"
              data-testid="participant-grid"
            >
              {participants.map((p) => (
                <ParticipantTile
                  key={p.identity}
                  participant={p}
                  isLocal={p === room.localParticipant}
                  isSpeaking={speaking.has(p.identity)}
                />
              ))}
            </div>
            <p className="px-4 pb-1 text-center text-xs text-gray-400" aria-live="polite">
              {participants.length} in meeting · media encrypted in transit
            </p>
            {/* Control dock */}
            <div className="flex items-center justify-center gap-3 bg-gray-900 px-4 py-4">
              <button
                type="button"
                onClick={() => void toggleMic()}
                aria-pressed={isMicEnabled}
                aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors ${
                  isMicEnabled
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
                data-testid="toggle-mic"
              >
                {isMicEnabled ? '🎙️' : '🔇'}
              </button>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                aria-pressed={isCameraEnabled}
                aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors ${
                  isCameraEnabled
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
                data-testid="toggle-camera"
              >
                {isCameraEnabled ? '📹' : '🚫'}
              </button>
              <button
                type="button"
                onClick={() => void handleLeave()}
                aria-label="Leave meeting"
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-red-600 px-6 text-base font-semibold text-white transition-colors hover:bg-red-500"
                data-testid="leave-meeting"
              >
                Leave
              </button>
            </div>
          </>
        )}
        {connectionState === ConnectionState.Disconnected && !error && (
          <div className="flex flex-1 items-center justify-center px-6">
            <p className="text-center text-sm text-gray-400">
              Disconnected from the meeting.
            </p>
          </div>
        )}
      </main>
    </AppShell>
  );
}
