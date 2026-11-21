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
import {
  applyAudioOnlyToPublication,
  applyAudioOnlyToPublications,
  setCameraEnabledForDataMode,
  type RemotePublicationLike,
} from '../../../lib/call-data';

type Phase = 'joining' | 'in-call' | 'ended' | 'error';

// QC-F-408: the peer's presence is its OWN state, separate from Phase
// (which tracks OUR join lifecycle). It is derived ONLY from the live
// Room (remoteParticipants + Room events) — never guessed, never timed
// into existence. 'left' is reachable only after 'present' (a peer who
// never joined stays 'waiting'; see §3.3/§3.4 of the build brief).
type PeerState = 'waiting' | 'present' | 'left';

// QC-F-408: waiting clock, honest elapsed time only (m:ss).
function formatWaitingClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

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
  // QC-F-408: peer presence (replaces the old `remoteName` state, whose
  // 'Connecting…' placeholder doubled as a name and was only ever set
  // from inside the remote VIDEO branch of attachTracks — an audio-only
  // peer was therefore heard but stayed "Connecting…" forever).
  // peerName is the REAL name/identity of the first remote participant,
  // or null while nobody is in the room; a placeholder is never stored
  // in it.
  const [peerState, setPeerState] = useState<PeerState>('waiting');
  const [peerName, setPeerName] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(
    null,
  );
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [noAnswer, setNoAnswer] = useState(false);
  const [endReason, setEndReason] = useState<'peer-left' | null>(null);
  const peerWasPresentRef = useRef(false);
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

  // QC-F-296: low-data mode — the preference's single home is the settings
  // contract's `calls` section; this state is its in-call mirror, read at
  // join time and written back by the in-call toggle. lowDataRef mirrors
  // it for the event handlers/callbacks that must read the CURRENT value.
  const [lowData, setLowData] = useState(false);
  const lowDataRef = useRef(false);
  const [lowDataBusy, setLowDataBusy] = useState(false);
  const [lowDataSaveFailed, setLowDataSaveFailed] = useState(false);
  const [lowDataPrefFailed, setLowDataPrefFailed] = useState(false);
  // QC-F-296: audio-only is SESSION-only (never persisted): publish-stop
  // plus receive-side remote-video disable, for this call only.
  const [audioOnly, setAudioOnly] = useState(false);
  const audioOnlyRef = useRef(false);
  const cameraOnBeforeAudioOnlyRef = useRef(true);

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
    // Remote video (first remote participant's camera). QC-F-408: this
    // loop now ONLY binds media and reports whether a remote camera
    // track is actually attached — the peer's NAME no longer lives
    // here (it comes from syncPeerPresence, so an audio-only peer is
    // named too).
    let videoAttached = false;
    for (const participant of room.remoteParticipants.values()) {
      const remoteVideo = participant.getTrackPublication(
        Track.Source.Camera,
      )?.videoTrack;
      if (remoteVideo && remoteVideoRef.current) {
        remoteVideo.attach(remoteVideoRef.current);
        videoAttached = true;
        break;
      }
    }
    setHasRemoteVideo(videoAttached);
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

  // QC-F-296: every remote video publication currently in the room —
  // the receive side of the audio-only mode.
  const collectRemoteVideoPublications = useCallback((): RemotePublicationLike[] => {
    const pubs: RemotePublicationLike[] = [];
    for (const participant of room.remoteParticipants.values()) {
      participant.trackPublications.forEach((pub) => {
        pubs.push(pub as unknown as RemotePublicationLike);
      });
    }
    return pubs;
  }, [room]);

  const detachRemoteAudio = useCallback(() => {
    const track = attachedAudioTrackRef.current;
    const el = attachedAudioElementRef.current ?? remoteAudioRef.current;
    if (track && el) track.detach(el);
    attachedAudioTrackRef.current = null;
    attachedAudioElementRef.current = null;
  }, []);

  // QC-F-408: derive peer presence from the ONE source of truth — who
  // is in room.remoteParticipants RIGHT NOW. Idempotent: every Room
  // event re-runs it and the latest room state wins, whatever order
  // events arrived in. The name comes from the participant itself
  // (name || identity || 'On the call' — the same fallback order the
  // old video branch used); the server join response carries no peer
  // name, and none is invented here (HG-408-2).
  const syncPeerPresence = useCallback(() => {
    const first = room.remoteParticipants.values().next().value as
      | { name?: string; identity?: string }
      | undefined;
    if (first) {
      peerWasPresentRef.current = true;
      setPeerName(first.name || first.identity || 'On the call');
      setPeerState('present');
      setNoAnswer(false);
    } else {
      setHasRemoteVideo(false);
      setPeerState(peerWasPresentRef.current ? 'left' : 'waiting');
    }
  }, [room]);

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
          .on(RoomEvent.TrackSubscribed, (_track, publication) => {
            // QC-F-296: a publication subscribed while audio-only is on
            // (a late joiner) joins the mode immediately — audio-only is
            // not a snapshot of whoever was present when it was toggled.
            if (audioOnlyRef.current) {
              applyAudioOnlyToPublication(
                publication as unknown as RemotePublicationLike | undefined,
                true,
              );
            }
            attachTracks();
          })
          .on(RoomEvent.TrackUnsubscribed, attachTracks)
          .on(RoomEvent.ParticipantConnected, () => {
            attachTracks();
            syncPeerPresence();
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            attachTracks();
            syncPeerPresence();
          })
          // QC-F-408: Meet-room pattern (meet/[roomId] page) — the
          // notice is shown ONLY on the room's own Reconnecting event
          // and cleared ONLY on Reconnected, which also re-derives
          // peer presence (the peer may have come or gone meanwhile).
          .on(RoomEvent.Reconnecting, () => {
            if (!cancelled) {
              setConnectionNotice(
                'Reconnecting… your media will resume automatically.',
              );
            }
          })
          .on(RoomEvent.Reconnected, () => {
            if (!cancelled) {
              setConnectionNotice(null);
              syncPeerPresence();
              attachTracks();
            }
          })
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            // QC-F-455: the room is the only source of truth for whether
            // audio playback is currently permitted (autoplay policy).
            if (!cancelled) setAudioBlocked(!room.canPlaybackAudio);
          })
          .on(RoomEvent.Disconnected, () => {
            detachRemoteAudio();
            if (!cancelled) setPhase('ended');
          });
        // QC-F-296: read the saved low-data preference BEFORE the camera
        // starts, so the join-time publish already carries the caps. A
        // failed read never blocks the call (a call matters more than a
        // preference) — it falls back to the default (off) and says so
        // honestly in the in-call UI.
        let initialLowData = false;
        try {
          const settingsRes = await apiClient.getSettings();
          if (settingsRes.success && settingsRes.data) {
            initialLowData = settingsRes.data.calls?.lowDataMode === true;
          } else if (!cancelled) {
            setLowDataPrefFailed(true);
          }
        } catch {
          if (!cancelled) setLowDataPrefFailed(true);
        }
        if (cancelled) return;
        lowDataRef.current = initialLowData;
        setLowData(initialLowData);
        await room.connect(res.data.serverUrl, res.data.token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        await setCameraEnabledForDataMode(
          room.localParticipant,
          true,
          initialLowData,
        );
        attachTracks();
        // QC-F-408: a peer who was ALREADY in the room before we
        // connected produces no ParticipantConnected event — this
        // post-connect sync is the only thing that can see them.
        syncPeerPresence();
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
  }, [callId, room, attachTracks, detachRemoteAudio, syncPeerPresence]);

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
    if (next) {
      // QC-F-296: turning the camera back on must keep the CURRENT
      // low-data caps — a plain setCameraEnabled(true) would silently
      // drop them. Turning the camera on also ends audio-only (the user
      // asked to send video again): remote video is restored first.
      if (audioOnlyRef.current) {
        audioOnlyRef.current = false;
        setAudioOnly(false);
        applyAudioOnlyToPublications(collectRemoteVideoPublications(), false);
      }
      await setCameraEnabledForDataMode(
        room.localParticipant,
        true,
        lowDataRef.current,
      ).catch(() => undefined);
    } else {
      await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
    }
    setIsCameraOn(next);
  }, [room, isCameraOn, collectRemoteVideoPublications]);

  // QC-F-296 §5.3: mid-call low-data toggle. Changing publish encoding
  // means restarting the camera track — the UI shows "Applying…" for
  // exactly that restart and never claims the switch is seamless. The
  // new value is also written back to the settings pref; if that write
  // fails, the mode still applies to THIS call and the honest line below
  // the toggle says so (never a fake "Saved").
  const toggleLowData = useCallback(async () => {
    const next = !lowData;
    lowDataRef.current = next;
    setLowData(next);
    setLowDataSaveFailed(false);
    setLowDataBusy(true);
    try {
      if (isCameraOn) {
        await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
        await setCameraEnabledForDataMode(room.localParticipant, true, next).catch(
          () => undefined,
        );
        attachTracks();
      }
    } finally {
      setLowDataBusy(false);
    }
    try {
      const res = await apiClient.updateSettings({ calls: { lowDataMode: next } });
      if (!res.success) setLowDataSaveFailed(true);
    } catch {
      setLowDataSaveFailed(true);
    }
  }, [room, lowData, isCameraOn, attachTracks]);

  // QC-F-296 §5.4: audio-only — publish-stop AND receive-side disable,
  // session-only. Off restores remote video, and restores the camera
  // ONLY if it was on before audio-only (never force-opens a camera
  // the user had deliberately off).
  const toggleAudioOnly = useCallback(async () => {
    const next = !audioOnly;
    audioOnlyRef.current = next;
    setAudioOnly(next);
    if (next) {
      cameraOnBeforeAudioOnlyRef.current = isCameraOn;
      if (isCameraOn) {
        await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
        setIsCameraOn(false);
      }
      applyAudioOnlyToPublications(collectRemoteVideoPublications(), true);
    } else {
      applyAudioOnlyToPublications(collectRemoteVideoPublications(), false);
      if (cameraOnBeforeAudioOnlyRef.current) {
        await setCameraEnabledForDataMode(
          room.localParticipant,
          true,
          lowDataRef.current,
        ).catch(() => undefined);
        setIsCameraOn(true);
        attachTracks();
      }
    }
  }, [room, audioOnly, isCameraOn, collectRemoteVideoPublications, attachTracks]);

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

  // QC-F-408: waiting clock — runs ONLY while we are in-call and the
  // peer has not joined. The timer measures elapsed waiting; it never
  // creates presence. At 60s the copy becomes the honest no-answer
  // state — there is deliberately NO auto-disconnect and NO backend
  // 'missed'/'declined' record: the page cannot know whether it is the
  // caller or the callee, or why the peer has not joined (§3.3).
  useEffect(() => {
    if (phase !== 'in-call' || peerState !== 'waiting') return;
    setWaitingSeconds(0);
    setNoAnswer(false);
    let ticks = 0;
    const interval = setInterval(() => {
      ticks += 1;
      setWaitingSeconds(ticks);
      if (ticks >= 60) setNoAnswer(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, peerState]);

  // QC-F-408: rejoin grace — when a peer who WAS present leaves, wait
  // 20s (a LiveKit disconnect is often a network blip) before ending
  // through the real endCall() path. The effect cleanup clears the
  // timer if the peer rejoins, the call ends another way, or the page
  // unmounts — so it can never fire endCall twice or after 'ended'
  // (HG-408-7).
  useEffect(() => {
    if (phase !== 'in-call' || peerState !== 'left') return;
    const timer = setTimeout(() => {
      setEndReason('peer-left');
      void endCall();
    }, 20_000);
    return () => clearTimeout(timer);
  }, [phase, peerState, endCall]);

  return (
    <AppShell
      topBar={
        <TopBar
          title={
            phase === 'in-call'
              ? peerState === 'waiting'
                ? 'Call'
                : (peerName ?? 'Call')
              : 'Call'
          }
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
            <p className="font-medium">
              {endReason === 'peer-left' && peerName
                ? `${peerName} left the call`
                : 'Call ended'}
            </p>
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-2 h-11 px-6 rounded-full bg-white/10 active:bg-white/20"
            >
              Back to chat
            </button>
          </div>
        )}

        {phase === 'in-call' && connectionNotice && (
          <div
            role="status"
            className="bg-amber-500/90 text-black text-center text-sm px-4 py-2"
          >
            {connectionNotice}
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
                aria-label={`${peerName ?? 'Remote participant'} video`}
              />
              {/* QC-F-408: peer-presence overlays — exactly one shows at
                  a time, inside the big area (never in the dock, so the
                  QC-F-487 390px dock math is untouched). They render
                  BEFORE the local preview so your own camera stays
                  visible above them. No emoji, no invented imagery:
                  the avatar is the peer's real initial. */}
              {peerState === 'waiting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-black">
                  <p aria-live="polite" className="font-medium">
                    Waiting for the other person to join…
                  </p>
                  <p className="text-sm text-white/60">
                    {formatWaitingClock(waitingSeconds)}
                  </p>
                  {noAnswer && (
                    <p className="text-sm text-white/60">
                      Still no answer — the other person hasn&apos;t
                      joined yet. You can keep waiting, or end the call.
                    </p>
                  )}
                </div>
              )}
              {peerState === 'present' && !hasRemoteVideo && peerName && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                  <div
                    className="w-24 h-24 rounded-full bg-white/15 flex items-center justify-center text-4xl font-medium"
                    aria-hidden
                  >
                    {peerName.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-lg font-medium">{peerName}</p>
                  <p className="text-sm text-white/60">Camera off</p>
                </div>
              )}
              {peerState === 'left' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-black">
                  <p className="font-medium">{peerName} left the call</p>
                  <p className="text-sm text-white/60">
                    Waiting briefly in case they rejoin…
                  </p>
                </div>
              )}
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
            {/* QC-F-487: the QC-F-455 sound button gets its own row above
                the control dock — inside the dock row it pushed the
                no-wrap row to ~646px on a 390px screen. Behaviour,
                copy and styling are unchanged; only its place moved. */}
            <div className="flex justify-center pt-3">
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
            {/* QC-F-296: low-data + audio-only controls live in their
                OWN row above the dock (same discipline as the QC-F-487
                sound row) so the no-wrap dock never overflows at 390px. */}
            <div className="flex flex-wrap items-center justify-center gap-3 px-4 pt-3">
              <button
                type="button"
                onClick={() => void toggleLowData()}
                disabled={lowDataBusy}
                aria-pressed={lowData}
                aria-label="Low data"
                className={`h-11 px-4 rounded-full text-sm font-medium disabled:opacity-50 ${
                  lowData ? 'bg-white text-black' : 'bg-white/15 text-white'
                }`}
              >
                {lowDataBusy ? 'Applying…' : 'Low data'}
              </button>
              <button
                type="button"
                onClick={() => void toggleAudioOnly()}
                aria-pressed={audioOnly}
                aria-label="Audio only"
                className={`h-11 px-4 rounded-full text-sm font-medium ${
                  audioOnly ? 'bg-white text-black' : 'bg-white/15 text-white'
                }`}
              >
                Audio only
              </button>
            </div>
            {audioOnly && (
              <p className="px-6 pt-2 text-center text-xs text-white/60">
                Audio only for this call — you won&apos;t send or receive video.
              </p>
            )}
            {lowDataSaveFailed && (
              <p role="alert" className="px-6 pt-2 text-center text-xs text-amber-300">
                Couldn&apos;t save this setting — it applies to this call only.
              </p>
            )}
            {lowDataPrefFailed && (
              <p className="px-6 pt-2 text-center text-xs text-white/60">
                Couldn&apos;t load your saved call settings, so this call uses
                the default quality.
              </p>
            )}
            <div className="relative pb-10 pt-4 flex items-center justify-center gap-6">
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
                presentation="responsive"
              />
              {/* QC-F-455 note: the sound-enable button now lives in
                  its own row directly above this dock (QC-F-487) —
                  shown ONLY when the room itself reported audio
                  playback blocked (AudioPlaybackStatusChanged); the
                  click is the user gesture LiveKit requires for
                  startAudio() and the button disappears only when a
                  later room event says playback is permitted again. */}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
