// ============================================================================
// QuantEdits - Timeline Service
// Multi-track timeline engine for video editing with clip management
// ============================================================================

export type TrackType = 'video' | 'audio' | 'text' | 'effect';

export interface Clip {
  id: string;
  trackId: string;
  startTime: number;
  endTime: number;
  sourceStart: number;
  sourceEnd: number;
  name: string;
}

export interface Track {
  id: string;
  type: TrackType;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
}

export class TimelineService {
  private tracks: Map<string, Track> = new Map();
  private trackIdCounter = 0;
  private clipIdCounter = 0;

  private generateTrackId(): string {
    this.trackIdCounter += 1;
    return `track-${this.trackIdCounter}`;
  }

  private generateClipId(): string {
    this.clipIdCounter += 1;
    return `clip-${this.clipIdCounter}`;
  }

  addTrack(type: TrackType): Track {
    const track: Track = {
      id: this.generateTrackId(),
      type,
      clips: [],
      muted: false,
      locked: false,
    };

    this.tracks.set(track.id, track);
    return { ...track, clips: [] };
  }

  removeTrack(trackId: string): boolean {
    return this.tracks.delete(trackId);
  }

  addClip(trackId: string, clip: Omit<Clip, 'id' | 'trackId'>): Clip | null {
    const track = this.tracks.get(trackId);
    if (!track) {
      return null;
    }

    if (track.locked) {
      return null;
    }

    const newClip: Clip = {
      id: this.generateClipId(),
      trackId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      name: clip.name,
    };

    track.clips.push(newClip);
    return { ...newClip };
  }

  removeClip(trackId: string, clipId: string): boolean {
    const track = this.tracks.get(trackId);
    if (!track || track.locked) {
      return false;
    }

    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index === -1) {
      return false;
    }

    track.clips.splice(index, 1);
    return true;
  }

  trimClip(trackId: string, clipId: string, newStart: number, newEnd: number): Clip | null {
    const track = this.tracks.get(trackId);
    if (!track || track.locked) {
      return null;
    }

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) {
      return null;
    }

    if (newStart >= newEnd) {
      return null;
    }

    clip.startTime = newStart;
    clip.endTime = newEnd;
    return { ...clip };
  }

  splitClip(trackId: string, clipId: string, splitPoint: number): [Clip, Clip] | null {
    const track = this.tracks.get(trackId);
    if (!track || track.locked) {
      return null;
    }

    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    const clip = track.clips[clipIndex];
    if (clipIndex === -1 || !clip) {
      return null;
    }

    if (splitPoint <= clip.startTime || splitPoint >= clip.endTime) {
      return null;
    }

    const sourceProgress = (splitPoint - clip.startTime) / (clip.endTime - clip.startTime);
    const sourceSplitPoint =
      clip.sourceStart + sourceProgress * (clip.sourceEnd - clip.sourceStart);

    // First clip: start to split
    const firstClip: Clip = {
      ...clip,
      endTime: splitPoint,
      sourceEnd: sourceSplitPoint,
    };

    // Second clip: split to end
    const secondClip: Clip = {
      id: this.generateClipId(),
      trackId,
      startTime: splitPoint,
      endTime: clip.endTime,
      sourceStart: sourceSplitPoint,
      sourceEnd: clip.sourceEnd,
      name: `${clip.name} (split)`,
    };

    track.clips.splice(clipIndex, 1, firstClip, secondClip);
    return [{ ...firstClip }, { ...secondClip }];
  }

  moveClip(trackId: string, clipId: string, newStartTime: number): Clip | null {
    const track = this.tracks.get(trackId);
    if (!track || track.locked) {
      return null;
    }

    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) {
      return null;
    }

    const duration = clip.endTime - clip.startTime;
    clip.startTime = newStartTime;
    clip.endTime = newStartTime + duration;
    return { ...clip };
  }

  getTotalDuration(): number {
    let maxEnd = 0;
    for (const track of this.tracks.values()) {
      for (const clip of track.clips) {
        if (clip.endTime > maxEnd) {
          maxEnd = clip.endTime;
        }
      }
    }
    return maxEnd;
  }

  getTracks(): Track[] {
    return Array.from(this.tracks.values()).map((t) => ({
      ...t,
      clips: t.clips.map((c) => ({ ...c })),
    }));
  }
}
