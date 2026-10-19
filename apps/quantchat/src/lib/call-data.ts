// ============================================================================
// QuantChat — Call data controls (QC-F-296 Slice 1)
// ============================================================================
//
// The single source of truth for the low-data call caps and the audio-only
// receive-side switch, shared by BOTH call surfaces (/calls/[callId] and
// /meet/[roomId]) so the two pages can never drift apart (one page at
// 300 kbps, the other at some other number by mistake).
//
// Honesty rules (specialist-qc-f-296-buildprep.md §3/§7, HG-296-2):
//   - The caps below are a DECLARED technical limit, not a measured
//     saving. No code, copy or test may turn them into an MB/percentage
//     claim — there is no RTC-stats plumbing in this app yet, so no real
//     byte count exists to quote.
//   - OFF means byte-identical legacy behaviour: both option builders
//     return `undefined`, so LiveKit receives exactly the defaults it
//     received before this feature existed (HG-296-3).
//   - Caps are applied PER PUBLISH (setCameraEnabled / publishTrack
//     options), never in the Room constructor — the Room is created in a
//     useState initializer before the user's preference can be read.

import type { TrackPublishOptions, VideoCaptureOptions } from 'livekit-client';

/**
 * The declared low-data video cap: 640×360 capture, at most 300 kbps and
 * 15 fps on publish. Chosen to match the WhatsApp-class "use less data
 * for calls" behaviour — a bound on quality, NOT a promise of how much
 * data a call will use (the real spend depends on the network, the SFU
 * and dynacast, and is not measured here).
 */
export const LOW_DATA_VIDEO = {
  width: 640,
  height: 360,
  maxBitrate: 300_000,
  maxFramerate: 15,
} as const;

/**
 * Capture options for the camera when (re)starting it. `undefined` when
 * low-data is off, so the browser/LiveKit default capture is untouched.
 */
export function cameraCaptureOptions(
  lowData: boolean,
): VideoCaptureOptions | undefined {
  if (!lowData) return undefined;
  return {
    resolution: {
      width: LOW_DATA_VIDEO.width,
      height: LOW_DATA_VIDEO.height,
      frameRate: LOW_DATA_VIDEO.maxFramerate,
    },
  };
}

/**
 * Publish options for the camera track when (re)publishing it.
 * `undefined` when low-data is off (legacy defaults, byte-identical).
 */
export function cameraPublishOptions(
  lowData: boolean,
): TrackPublishOptions | undefined {
  if (!lowData) return undefined;
  return {
    videoEncoding: {
      maxBitrate: LOW_DATA_VIDEO.maxBitrate,
      maxFramerate: LOW_DATA_VIDEO.maxFramerate,
    },
  };
}

// ---------------------------------------------------------------------------
// Arity-preserving call sites (QC-F-296 resume fix, HG-296-3)
//
// Passing `undefined` options explicitly is NOT the legacy call: the
// QC-F-322 suites pin the pre-296 call sites argument-for-argument
// (`setCameraEnabled(true)`, `publishTrack(track)`), and a merged
// assertion must never be loosened to fit a new feature. So when
// low-data is OFF these helpers make the legacy call itself — same
// arguments, same arity — and only an ON call carries the caps.
// ---------------------------------------------------------------------------

/** Structural minimum of a LiveKit local participant for camera control. */
export interface CameraControlParticipant {
  setCameraEnabled(
    enabled: boolean,
    captureOptions?: VideoCaptureOptions,
    publishOptions?: TrackPublishOptions,
  ): Promise<unknown>;
  publishTrack(
    track: unknown,
    publishOptions?: TrackPublishOptions,
  ): Promise<unknown>;
}

/** Enable/disable the camera, applying the low-data caps only when ON. */
export function setCameraEnabledForDataMode(
  participant: CameraControlParticipant,
  enabled: boolean,
  lowData: boolean,
): Promise<unknown> {
  if (lowData) {
    return participant.setCameraEnabled(
      enabled,
      cameraCaptureOptions(true),
      cameraPublishOptions(true),
    );
  }
  return participant.setCameraEnabled(enabled);
}

/** Publish a (possibly processed) track, capped only when low-data is ON. */
export function publishTrackForDataMode(
  participant: CameraControlParticipant,
  track: unknown,
  lowData: boolean,
): Promise<unknown> {
  if (lowData) {
    return participant.publishTrack(track, cameraPublishOptions(true));
  }
  return participant.publishTrack(track);
}

// ---------------------------------------------------------------------------
// Audio-only receive side (QC-F-296 §5.4)
//
// Turning your own camera off is NOT an audio-only mode: the largest part
// of a video call's data is the INCOMING video. A real audio-only mode
// also disables subscription rendering on every remote VIDEO publication
// (TrackPublication.setEnabled(false) keeps the subscription but stops
// the SFU sending/rendering the track), for participants already present
// AND for publications subscribed later. Remote AUDIO publications are
// never touched — the peer must still be heard.
// ---------------------------------------------------------------------------

/** Structural minimum of a LiveKit remote track publication. */
export interface RemotePublicationLike {
  kind?: string;
  source?: string;
  setEnabled: (enabled: boolean) => unknown;
}

function isVideoPublication(pub: RemotePublicationLike): boolean {
  // LiveKit Track.Kind.Video === 'video', Track.Source.Camera and
  // Track.Source.ScreenShare are the video sources. Accept either signal
  // so the helper works against the real client and structural doubles.
  return (
    pub.kind === 'video' ||
    pub.source === 'camera' ||
    pub.source === 'screenShare'
  );
}

/** Apply the audio-only state to ONE remote publication (late joiners). */
export function applyAudioOnlyToPublication(
  pub: RemotePublicationLike | null | undefined,
  audioOnly: boolean,
): void {
  if (!pub || !isVideoPublication(pub)) return;
  pub.setEnabled(!audioOnly);
}

/** Apply the audio-only state to a batch of remote publications. */
export function applyAudioOnlyToPublications(
  publications: Iterable<RemotePublicationLike>,
  audioOnly: boolean,
): void {
  for (const pub of publications) {
    applyAudioOnlyToPublication(pub, audioOnly);
  }
}
