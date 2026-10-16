// @vitest-environment jsdom
//
// QC-F-443 — ParticipantTile camera/mic freshness pins
// (specialist-qc-f-443-buildprep.md §5, pins T1–T9).
//
// The defect: ParticipantTile copied camera/mic state into useState inside
// an effect keyed on [participant]. The LiveKit participant object is
// STABLE across mute/publish changes (the meet page re-renders the tile
// with the same object, keyed by identity, on every track event), so the
// copied state froze at first render — audio-only joiners who turned
// their camera on never got a <video>, camera-off kept showing video
// (avatar never appeared, track never detached), and the muted badge
// never moved.
//
// These pins therefore mutate ONE stable fake participant object from the
// inside (exactly how the SFU mutates the real object) and re-render with
// that SAME object — the page-refresh simulation. Building a fresh
// participant object per render is banned here: it would hide the freeze.
//
// Negative control (pre-fix ParticipantTile from origin/main):
//   T2, T3, T4, T5, T6, T7 and T8 (aria/hit-area part) MUST fail;
//   T1, T8 (volume still applies) and T9 pass on both.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LocalParticipant } from 'livekit-client';
import { ParticipantTile } from '../ParticipantTile';

// ─── Stable fake LiveKit (module-level, hoisted identity) ──────────────────
// ParticipantTile only reads Track.Source at runtime; the participant and
// track classes below are the test's own stable fakes.
vi.mock('livekit-client', () => ({
  Track: {
    Source: {
      Camera: 'camera',
      Microphone: 'microphone',
      ScreenShare: 'screen_share',
    },
  },
}));

class FakeTrack {
  attach = vi.fn((_el: unknown) => undefined);
  detach = vi.fn((_el: unknown) => undefined);
  constructor(public sid: string) {}
}

class FakeParticipant {
  identity: string;
  name: string;
  isCameraEnabled = false;
  isMicrophoneEnabled = true;
  publications = new Map<string, { track?: FakeTrack }>();
  constructor(identity: string, name: string) {
    this.identity = identity;
    this.name = name;
  }
  getTrackPublication(source: string) {
    return this.publications.get(source);
  }
  setCameraTrack(track: FakeTrack | undefined) {
    if (track) {
      this.publications.set('camera', { track });
    } else {
      this.publications.delete('camera');
    }
  }
  setMicTrack(track: FakeTrack | undefined) {
    if (track) {
      this.publications.set('microphone', { track });
    } else {
      this.publications.delete('microphone');
    }
  }
}

function tileElement(p: FakeParticipant, extra: { isLocal?: boolean; handRaised?: boolean } = {}) {
  return (
    <ParticipantTile
      participant={p as unknown as LocalParticipant}
      isLocal={extra.isLocal ?? false}
      handRaised={extra.handRaised ?? false}
    />
  );
}

describe('QC-F-443 ParticipantTile camera/mic freshness', () => {
  it('T1: audio-only start renders the avatar, no <video>, no attach', () => {
    const p = new FakeParticipant('u1', 'Asha');
    p.isCameraEnabled = false; // joined audio-only, no camera publication
    const { container } = render(tileElement(p));
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByTestId('participant-tile').textContent).toContain('Asha');
  });

  it('T1b: camera enabled but no track yet still renders the honest avatar', () => {
    const p = new FakeParticipant('u1', 'Asha');
    p.isCameraEnabled = true; // publication/track not subscribed yet
    const { container } = render(tileElement(p));
    expect(container.querySelector('video')).toBeNull();
  });

  it('T2: SAME object turning camera on shows <video> and attaches the new track', () => {
    const p = new FakeParticipant('u1', 'Asha');
    p.isCameraEnabled = false;
    const { container, rerender } = render(tileElement(p));
    expect(container.querySelector('video')).toBeNull();

    const v1 = new FakeTrack('v1');
    p.isCameraEnabled = true;
    p.setCameraTrack(v1);
    rerender(tileElement(p)); // page refresh: same object, new array upstream

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(v1.attach).toHaveBeenCalledTimes(1);
    expect(v1.attach.mock.calls[0]?.[0]).toBe(video);
  });

  it('T3: camera on → off swaps back to the avatar and detaches the track', () => {
    const p = new FakeParticipant('u1', 'Asha');
    const v1 = new FakeTrack('v1');
    p.isCameraEnabled = true;
    p.setCameraTrack(v1);
    const { container, rerender } = render(tileElement(p));
    expect(container.querySelector('video')).not.toBeNull();
    expect(v1.attach).toHaveBeenCalledTimes(1);
    const attachedEl = v1.attach.mock.calls[0]?.[0];

    p.isCameraEnabled = false;
    rerender(tileElement(p));

    expect(container.querySelector('video')).toBeNull();
    expect(v1.detach).toHaveBeenCalledTimes(1);
    expect(v1.detach.mock.calls[0]?.[0]).toBe(attachedEl);
  });

  it('T4: mic toggle moves the muted badge in both directions on the SAME object', () => {
    const p = new FakeParticipant('u1', 'Asha');
    p.isMicrophoneEnabled = true;
    const { container, rerender } = render(tileElement(p));
    expect(container.querySelector('[title="Muted"]')).toBeNull();

    p.isMicrophoneEnabled = false;
    rerender(tileElement(p));
    expect(container.querySelector('[title="Muted"]')).not.toBeNull();

    p.isMicrophoneEnabled = true;
    rerender(tileElement(p));
    expect(container.querySelector('[title="Muted"]')).toBeNull();
  });

  it('T5: the local tile follows the same transitions (and keeps its guards)', () => {
    const p = new FakeParticipant('me', 'Me');
    p.isCameraEnabled = false;
    p.isMicrophoneEnabled = true;
    const { container, rerender } = render(tileElement(p, { isLocal: true }));
    expect(container.querySelector('video')).toBeNull();
    // Local guards stay: no volume slider, no <audio> element.
    expect(screen.queryByTestId('volume-slider')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();

    const v1 = new FakeTrack('v1');
    p.isCameraEnabled = true;
    p.setCameraTrack(v1);
    p.isMicrophoneEnabled = false;
    rerender(tileElement(p, { isLocal: true }));

    expect(container.querySelector('video')).not.toBeNull();
    expect(v1.attach).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[title="Muted"]')).not.toBeNull();
  });

  it('T6: same-track mute/unmute re-attaches the SAME track to the remounted <video>', () => {
    const p = new FakeParticipant('u1', 'Asha');
    const v1 = new FakeTrack('v1');
    p.isCameraEnabled = true;
    p.setCameraTrack(v1);
    const { container, rerender } = render(tileElement(p));
    expect(v1.attach).toHaveBeenCalledTimes(1);

    // Mute: the track OBJECT does not change — only isCameraEnabled flips.
    p.isCameraEnabled = false;
    rerender(tileElement(p));
    expect(container.querySelector('video')).toBeNull();
    expect(v1.detach).toHaveBeenCalledTimes(1);

    // Unmute: same track object must attach again, to the NEW element.
    // A fix keyed only on [videoTrack] fails here (black video).
    p.isCameraEnabled = true;
    rerender(tileElement(p));
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(v1.attach).toHaveBeenCalledTimes(2);
    expect(v1.attach.mock.calls[1]?.[0]).toBe(video);
  });

  it('T7: track swap while camera stays on detaches the old and attaches the new', () => {
    const p = new FakeParticipant('u1', 'Asha');
    const v1 = new FakeTrack('v1');
    const v2 = new FakeTrack('v2');
    p.isCameraEnabled = true;
    p.setCameraTrack(v1);
    const { container, rerender } = render(tileElement(p));
    expect(v1.attach).toHaveBeenCalledTimes(1);

    p.setCameraTrack(v2); // device switch / re-publish (e.g. blur track)
    rerender(tileElement(p));

    expect(v1.detach).toHaveBeenCalledTimes(1);
    expect(v2.attach).toHaveBeenCalledTimes(1);
    expect(v2.attach.mock.calls[0]?.[0]).toBe(container.querySelector('video'));
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('T8: volume slider is labelled, has a real hit area, and still drives volume', () => {
    const p = new FakeParticipant('u1', 'Asha');
    const mic = new FakeTrack('mic1');
    p.setMicTrack(mic);
    const { container } = render(tileElement(p));

    const slider = screen.getByTestId('volume-slider') as HTMLInputElement;
    expect(slider.getAttribute('aria-label')).toBe('Volume for Asha');
    expect(slider.className.split(/\s+/)).toContain('h-4');
    expect(slider.className.split(/\s+/)).not.toContain('h-1');

    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio).not.toBeNull();
    fireEvent.change(slider, { target: { value: '40' } });
    expect(audio.volume).toBeCloseTo(0.4);
  });

  it('T9: QC-F-263 hand badge still follows the caller-derived prop', () => {
    const p = new FakeParticipant('u1', 'Asha');
    const { rerender } = render(tileElement(p, { handRaised: false }));
    expect(screen.queryByTestId('hand-badge')).toBeNull();

    rerender(tileElement(p, { handRaised: true }));
    expect(screen.getByTestId('hand-badge')).not.toBeNull();

    rerender(tileElement(p, { handRaised: false }));
    expect(screen.queryByTestId('hand-badge')).toBeNull();
  });
});
