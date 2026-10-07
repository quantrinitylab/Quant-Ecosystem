// ============================================================================
// QuantMax - Duet & Stitch Service
// Manages duet videos (side-by-side reactions) and stitches (sequential clips)
// ============================================================================

export type DuetLayout = 'side_by_side' | 'top_bottom' | 'green_screen' | 'react';

export interface Duet {
  id: string;
  originalVideoId: string;
  userVideoId: string;
  layout: DuetLayout;
  createdAt: number;
}

export interface Stitch {
  id: string;
  originalVideoId: string;
  userVideoId: string;
  stitchPoint: number;
  createdAt: number;
}

export class DuetStitchService {
  private duets: Map<string, Duet> = new Map();
  private stitches: Map<string, Stitch> = new Map();
  private duetDisabled: Set<string> = new Set();
  private stitchDisabled: Set<string> = new Set();
  private idCounter = 0;

  private generateId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  createDuet(originalVideoId: string, userVideoId: string, layout: DuetLayout): Duet {
    const duet: Duet = {
      id: this.generateId('duet'),
      originalVideoId,
      userVideoId,
      layout,
      createdAt: Date.now(),
    };
    this.duets.set(duet.id, duet);
    return duet;
  }

  createStitch(originalVideoId: string, userVideoId: string, stitchPoint: number): Stitch {
    const stitch: Stitch = {
      id: this.generateId('stitch'),
      originalVideoId,
      userVideoId,
      stitchPoint,
      createdAt: Date.now(),
    };
    this.stitches.set(stitch.id, stitch);
    return stitch;
  }

  getLayouts(): { layout: DuetLayout; label: string; description: string }[] {
    return [
      {
        layout: 'side_by_side',
        label: 'Side by Side',
        description: 'Videos play next to each other',
      },
      { layout: 'top_bottom', label: 'Top & Bottom', description: 'Videos stacked vertically' },
      {
        layout: 'green_screen',
        label: 'Green Screen',
        description: 'Original video as background',
      },
      { layout: 'react', label: 'React', description: 'Picture-in-picture reaction view' },
    ];
  }

  getDuetsForVideo(videoId: string): Duet[] {
    const results: Duet[] = [];
    for (const duet of this.duets.values()) {
      if (duet.originalVideoId === videoId) {
        results.push(duet);
      }
    }
    return results;
  }

  getStitchesForVideo(videoId: string): Stitch[] {
    const results: Stitch[] = [];
    for (const stitch of this.stitches.values()) {
      if (stitch.originalVideoId === videoId) {
        results.push(stitch);
      }
    }
    return results;
  }

  canDuet(videoId: string): boolean {
    return !this.duetDisabled.has(videoId);
  }

  canStitch(videoId: string): boolean {
    return !this.stitchDisabled.has(videoId);
  }

  disableDuet(videoId: string): void {
    this.duetDisabled.add(videoId);
  }

  disableStitch(videoId: string): void {
    this.stitchDisabled.add(videoId);
  }
}
