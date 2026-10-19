// ============================================================================
// QC-F-296 — call-data helper pins (specialist-qc-f-296-buildprep.md §8,
// NC-296-3 + the audio-only publication half of NC-296-10/11).
//
// The helper is the SINGLE source of the low-data caps for both call
// surfaces. Pins: the exact declared cap values, OFF = undefined
// (byte-identical legacy LiveKit behaviour, HG-296-3), and the
// receive-side switch touching ONLY video publications (remote audio
// must always survive — the peer must still be heard).
//
// Negative control: on pre-fix code this module does not exist at all,
// so the suite fails at import there.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  LOW_DATA_VIDEO,
  cameraCaptureOptions,
  cameraPublishOptions,
  publishTrackForDataMode,
  setCameraEnabledForDataMode,
  applyAudioOnlyToPublication,
  applyAudioOnlyToPublications,
} from '../call-data';

describe('QC-F-296 low-data caps (NC-296-3)', () => {
  it('declares the band cap exactly: 640x360, 300_000 bitrate, 15 fps', () => {
    expect(LOW_DATA_VIDEO).toEqual({
      width: 640,
      height: 360,
      maxBitrate: 300_000,
      maxFramerate: 15,
    });
  });

  it('capture options ON carry the resolution cap', () => {
    expect(cameraCaptureOptions(true)).toEqual({
      resolution: { width: 640, height: 360, frameRate: 15 },
    });
  });

  it('publish options ON carry the encoding cap', () => {
    expect(cameraPublishOptions(true)).toEqual({
      videoEncoding: { maxBitrate: 300_000, maxFramerate: 15 },
    });
  });

  it('OFF returns undefined for both — LiveKit defaults stay untouched', () => {
    expect(cameraCaptureOptions(false)).toBeUndefined();
    expect(cameraPublishOptions(false)).toBeUndefined();
  });
});

describe('QC-F-296 arity-preserving call sites (F-322 pin sangam)', () => {
  // Passing `undefined` options explicitly is NOT the legacy call: the
  // merged QC-F-322 suites pin the pre-296 call sites argument-for-
  // argument (`setCameraEnabled(true)`, `publishTrack(track)`). The
  // helpers must make the legacy call itself when low-data is OFF, and
  // carry the caps only when it is ON.
  function fakeParticipant() {
    return {
      setCameraEnabled: vi.fn(
        async (
          _enabled: boolean,
          _capture?: unknown,
          _publish?: unknown,
        ) => undefined,
      ),
      publishTrack: vi.fn(
        async (_track: unknown, _opts?: unknown) => undefined,
      ),
    };
  }

  it('OFF: setCameraEnabled is called with exactly one argument', async () => {
    const p = fakeParticipant();
    await setCameraEnabledForDataMode(p, true, false);
    expect(p.setCameraEnabled).toHaveBeenCalledTimes(1);
    expect(p.setCameraEnabled.mock.calls[0]).toHaveLength(1);
    expect(p.setCameraEnabled.mock.calls[0][0]).toBe(true);
  });

  it('ON: setCameraEnabled carries capture + publish caps (3 arguments)', async () => {
    const p = fakeParticipant();
    await setCameraEnabledForDataMode(p, true, true);
    expect(p.setCameraEnabled.mock.calls[0]).toHaveLength(3);
    expect(p.setCameraEnabled.mock.calls[0][1]).toEqual({
      resolution: { width: 640, height: 360, frameRate: 15 },
    });
    expect(p.setCameraEnabled.mock.calls[0][2]).toEqual({
      videoEncoding: { maxBitrate: 300_000, maxFramerate: 15 },
    });
  });

  it('OFF: publishTrack is called with exactly the track (1 argument)', async () => {
    const p = fakeParticipant();
    const track = { id: 't1' };
    await publishTrackForDataMode(p, track, false);
    expect(p.publishTrack).toHaveBeenCalledTimes(1);
    expect(p.publishTrack.mock.calls[0]).toHaveLength(1);
    expect(p.publishTrack.mock.calls[0][0]).toBe(track);
  });

  it('ON: publishTrack carries the publish cap (2 arguments)', async () => {
    const p = fakeParticipant();
    const track = { id: 't1' };
    await publishTrackForDataMode(p, track, true);
    expect(p.publishTrack.mock.calls[0]).toHaveLength(2);
    expect(p.publishTrack.mock.calls[0][1]).toEqual({
      videoEncoding: { maxBitrate: 300_000, maxFramerate: 15 },
    });
  });
});

describe('QC-F-296 audio-only receive side (NC-296-10/11 helper half)', () => {
  function fakePub(kind: string, source?: string) {
    return { kind, source, setEnabled: vi.fn() };
  }

  it('disables video publications and never touches audio publications', () => {
    const video = fakePub('video', 'camera');
    const screen = fakePub('video', 'screenShare');
    const audio = fakePub('audio', 'microphone');
    applyAudioOnlyToPublications([video, screen, audio], true);
    expect(video.setEnabled).toHaveBeenCalledTimes(1);
    expect(video.setEnabled).toHaveBeenCalledWith(false);
    expect(screen.setEnabled).toHaveBeenCalledWith(false);
    expect(audio.setEnabled).not.toHaveBeenCalled();
  });

  it('re-enables video publications when audio-only turns off', () => {
    const video = fakePub('video', 'camera');
    const audio = fakePub('audio', 'microphone');
    applyAudioOnlyToPublications([video, audio], false);
    expect(video.setEnabled).toHaveBeenCalledWith(true);
    expect(audio.setEnabled).not.toHaveBeenCalled();
  });

  it('single-publication form (late joiner path) applies the same rule', () => {
    const video = fakePub('video', 'camera');
    const audio = fakePub('audio', 'microphone');
    applyAudioOnlyToPublication(video, true);
    applyAudioOnlyToPublication(audio, true);
    expect(video.setEnabled).toHaveBeenCalledWith(false);
    expect(audio.setEnabled).not.toHaveBeenCalled();
  });

  it('null/undefined publication is a no-op, not a crash', () => {
    expect(() => applyAudioOnlyToPublication(null, true)).not.toThrow();
    expect(() => applyAudioOnlyToPublication(undefined, true)).not.toThrow();
  });
});
