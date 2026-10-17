'use client';

// ============================================================================
// QuantChat — 1:1 call room (/calls/[callId])
// ============================================================================
//
// Real voice/video calls on the LiveKit backend. Joins via
// POST /calls/:id/join (server-issued token, fails closed with an honest
// error when calls are unavailable) and connects a livekit-client Room.
// No fake call UI: if the backend cannot provide a token, the page says so.

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
} from 'livekit-client';

// QC-F-455: structural minimum of a LiveKit audio track for attach/detach.
// The publication getter's static type is the Local|Remote audio-track
// union; only the remote microphone publication is ever read (see
// attachTracks), and both members share this attach/detach surface.
type AttachableAudioTrack = {
  attach: (element: HTMLMediaElement) => unknown;
  detach: (element: HTMLMediaElement) => unknown;
};
import {
  AppShell,
  TopBar,
  BackgroundBlur,
  useBackgroundBlur,
  BACKGROUND_ASSET_PATH,
} from '@quant/shared-ui';
import { apiClient } from '../../../services/api-client';

type Phase = 'joining' | 'in-call' | 'ended' | 'error';

export default function CallRoomPage({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = use(params);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('joining');
  const [error, setError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [remoteName, setRemoteName] = useState<string>('Connecting…');
  const [room] = useState(
    () => new Room({ adaptiveStream: true, dynacast: true }),
  );
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  // QC-F-455: identity guard for the one bound remote mic track, plus the
  // exact element it was attached to (F-443 closure discipline — detach
  // from the element captured at attach time, never a re-read ref).
  const attachedAudioTrackRef = useRef<AttachableAudioTrack | null>(null);
  const attachedAudioElementRef = useRef<HTMLAudioElement | null>(null);
  // QC-F-455: honest autoplay state — set ONLY from the room's
  // AudioPlaybackStatusChanged event, never assumed or self-cleared.
  const [audioBlocked, setAudioBlocked] = useState(false);
  const joinedRef = useRef(false);

  // QC-F-322: in-call background blur (this page auto-joins, so there
  // is no pre-join choice here — brief Sudhaar 5). Bound to the live
  // camera publication track; status is the track's own proof
  // (getProcessor()), and a new track after a camera toggle is
  // re-processed by the hook before anything may claim "Blur on".
  const camTrack = (room.localParticipant.getTrackPublication(
    Track.Source.Camera,
  )?.videoTrack ?? null) as LocalVideoTrack | null;
  const background = useBackgroundBlur(camTrack, {
    assetPath: BACKGROUND_ASSET_PATH,
  });

  const attachTracks = useCallback(() => {
    // Local preview
    const localVideo = room.localParticipant.getTrackPublication(
      Track.Source.Camera,
    )?.videoTrack;
    if (localVideo && localVideoRef.current) {
      localVideo.attach(localVideoRef.current);
    }
    // Remote video (first remote participant's camera)
    for (const participant of room.remoteParticipants.values()) {
      const remoteVideo = participant.getTrackPublication(
        Track.Source.Camera,
      )?.videoTrack;
      if (remoteVideo && remoteVideoRef.current) {
        remoteVideo.attach(remoteVideoRef.current);
        setRemoteName(participant.name || participant.identity || 'On the call');
        break;
      }
    }
    // QC-F-455: remote audio — the FIRST remote participant's microphone
    // track, chosen independently of the video loop above (an audio-only
    // peer has no camera publication, and must still be heard). LiveKit
    // plays audio only through an attached HTMLAudioElement; without this
    // the peer is visible but never heard. The LOCAL microphone is never
    // read here — local audio is publish-only (echo guard).
    let desiredAudio: AttachableAudioTrack | undefined;
    for (const participant of room.remoteParticipants.values()) {
      desiredAudio = participant.getTrackPublication(
        Track.Source.Microphone,
      )?.audioTrack;
      if (desiredAudio) break;
    }
    const attachedAudio = attachedAudioTrackRef.current;
    if ((desiredAudio ?? null) !== attachedAudio) {
      if (attachedAudio) {
        const el =
          attachedAudioElementRef.current ?? remoteAudioRef.current;
        if (el) attachedAudio.detach(el);
        attachedAudioTrackRef.current = null;
        attachedAudioElementRef.current = null;
      }
      if (desiredAudio && remoteAudioRef.current) {
        desiredAudio.attach(remoteAudioRef.current);
        attachedAudioTrackRef.current = desiredAudio;
        attachedAudioElementRef.current = remoteAudioRef.current;
      }
    }
  }, [room]);

  const detachRemoteAudio = useCallback(() => {
    const track = attachedAudioTrackRef.current;
    const el = attachedAudioElementRef.current ?? remoteAudioRef.current;
    if (track && el) track.detach(el);
    attachedAudioTrackRef.current = null;
    attachedAudioElementRef.current = null;
  }, []);

  useEffect(() => {
    if (joinedRef.current || !callId) return;
    joinedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.joinCall(callId);
        if (cancelled) return;
        if (!res.success || !res.data?.token || !res.data?.serverUrl) {
          throw new Error(
            res.error?.message || 'Could not join the call. Calls may be unavailable.',
          );
        }
        room
          .on(RoomEvent.TrackSubscribed, attachTracks)
          .on(RoomEvent.TrackUnsubscribed, attachTracks)
          .on(RoomEvent.ParticipantConnected, attachTracks)
          .on(RoomEvent.ParticipantDisconnected, attachTracks)
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            // QC-F-455: the room is the only source of truth for whether
            // audio playback is currently permitted (autoplay policy).
            if (!cancelled) setAudioBlocked(!room.canPlaybackAudio);
          })
          .on(RoomEvent.Disconnected, () => {
            detachRemoteAudio();
            if (!cancelled) setPhase('ended');
          });
        await room.connect(res.data.serverUrl, res.data.token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.localParticipant.setCameraEnabled(true);
        attachTracks();
        setPhase('in-call');
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Could not join the call.',
          );
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      // QC-F-455: detach the bound remote mic track BEFORE disconnecting,
      // so no track stays bound to a dead element after leaving the page.
      detachRemoteAudio();
      try {
        room.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }, [callId, room, attachTracks, detachRemoteAudio]);

  // QC-F-455: attachTracks() runs at join time while the page is still in
  // the 'joining' phase — the in-call media elements do not exist yet, so
  // that call cannot bind anything. Re-run it once the in-call UI (and its
  // <video>/<audio> elements) has actually mounted; the identity guard
  // makes repeat runs no-ops.
  useEffect(() => {
    if (phase === 'in-call') attachTracks();
  }, [phase, attachTracks]);

  const toggleMic = useCallback(async () => {
    const next = !isMicOn;
    await room.localParticipant.setMicrophoneEnabled(next).catch(() => undefined);
    setIsMicOn(next);
  }, [room, isMicOn]);

  const toggleCamera = useCallback(async () => {
    const next = !isCameraOn;
    await room.localParticipant.setCameraEnabled(next).catch(() => undefined);
    setIsCameraOn(next);
  }, [room, isCameraOn]);

  const endCall = useCallback(async () => {
    try {
      room.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      await apiClient.endCall(callId);
    } catch {
      /* call record cleanup is best-effort */
    }
    setPhase('ended');
  }, [room, callId]);

  return (
    <AppShell
      topBar={
        <TopBar
          title={phase === 'in-call' ? remoteName : 'Call'}
          onBack={() => void endCall().then(() => router.back())}
        />
      }
    >
      <div className="flex flex-col h-full bg-black text-white">
        {phase === 'joining' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin"
              aria-hidden
            />
            <p aria-live="polite">Joining call…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-5xl" aria-hidden>
              📵
            </p>
            <p className="font-medium">Couldn&apos;t start the call</p>
            <p className="text-sm text-white/60">{error}</p>
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-2 h-11 px-6 rounded-full bg-white/10 active:bg-white/20"
            >
              Back to chat
            </button>
          </div>
        )}

        {phase === 'ended' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-5xl" aria-hidden>
              📞
            </p>
            <p className="font-medium">Call ended</p>
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-2 h-11 px-6 rounded-full bg-white/10 active:bg-white/20"
            >
              Back to chat
            </button>
          </div>
        )}

        {phase === 'in-call' && (
          <>
            <div className="flex-1 relative">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                aria-label={`${remoteName} video`}
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 w-28 h-40 object-cover rounded-2xl border border-white/20 bg-zinc-900"
                aria-label="Your video preview"
              />
            </div>
            {/* QC-F-455: the remote peer's voice plays only through this
                element (remote mic track is attached to it by
                attachTracks). No visual styling — an <audio> element has
                no picture; display:none can disturb playback. */}
            <audio ref={remoteAudioRef} autoPlay aria-hidden="true" />
            <div className="pb-10 pt-4 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => void toggleMic()}
                aria-pressed={isMicOn}
                aria-label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
                  isMicOn ? 'bg-white/15' : 'bg-red-500'
                }`}
              >
                {isMicOn ? '🎙️' : '🔇'}
              </button>
              <button
                type="button"
                onClick={() => void endCall()}
                aria-label="End call"
                className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-3xl"
              >
                📵
              </button>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                aria-pressed={isCameraOn}
                aria-label={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
                  isCameraOn ? 'bg-white/15' : 'bg-red-500'
                }`}
              >
                {isCameraOn ? '📹' : '🚫'}
              </button>
              {/* QC-F-322: background menu — "Blur on" renders only
                  while the published track really carries the
                  processor; failure shows the honest error copy. */}
              <BackgroundBlur
                mode={background.mode}
                status={background.status}
                error={background.error}
                onModeChange={background.setMode}
              />
              {/* QC-F-455: shown ONLY when the room itself reported audio
                  playback blocked (AudioPlaybackStatusChanged). The click
                  is the user gesture LiveKit requires for startAudio();
                  the button disappears only when a later room event says
                  playback is permitted again — never on the click itself. */}
              {audioBlocked && (
                <button
                  type="button"
                  onClick={() => {
                    void room.startAudio();
                  }}
                  className="h-11 px-5 rounded-full bg-white text-black font-medium"
                >
                  Tap to enable sound
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
