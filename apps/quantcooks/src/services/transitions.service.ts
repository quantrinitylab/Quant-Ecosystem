// ============================================================================
// QuantEdits - Transitions Service
// Video transition library with application, removal, and validation
// ============================================================================

export type TransitionType = 'fade' | 'dissolve' | 'wipe' | 'zoom' | 'slide' | 'blur' | 'spin';

export interface Transition {
  id: string;
  type: TransitionType;
  duration: number;
  clipAId: string;
  clipBId: string;
  params: Record<string, number>;
}

interface TransitionPreset {
  type: TransitionType;
  name: string;
  defaultDuration: number;
}

const TRANSITION_PRESETS: TransitionPreset[] = [
  { type: 'fade', name: 'Fade', defaultDuration: 500 },
  { type: 'dissolve', name: 'Dissolve', defaultDuration: 750 },
  { type: 'wipe', name: 'Wipe', defaultDuration: 600 },
  { type: 'zoom', name: 'Zoom', defaultDuration: 400 },
  { type: 'slide', name: 'Slide', defaultDuration: 500 },
  { type: 'blur', name: 'Blur', defaultDuration: 300 },
  { type: 'spin', name: 'Spin', defaultDuration: 800 },
];

export class TransitionsService {
  private transitions: Map<string, Transition> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `transition-${this.idCounter}`;
  }

  getAvailable(): { type: TransitionType; name: string; defaultDuration: number }[] {
    return TRANSITION_PRESETS.map((p) => ({ ...p }));
  }

  apply(clipAId: string, clipBId: string, type: TransitionType, duration?: number): Transition {
    const preset = TRANSITION_PRESETS.find((p) => p.type === type);
    const effectiveDuration = duration ?? preset?.defaultDuration ?? 500;

    const transition: Transition = {
      id: this.generateId(),
      type,
      duration: effectiveDuration,
      clipAId,
      clipBId,
      params: {},
    };

    this.transitions.set(transition.id, transition);
    return { ...transition, params: { ...transition.params } };
  }

  remove(transitionId: string): boolean {
    return this.transitions.delete(transitionId);
  }

  update(
    transitionId: string,
    changes: Partial<Pick<Transition, 'duration' | 'params'>>,
  ): Transition | null {
    const transition = this.transitions.get(transitionId);
    if (!transition) {
      return null;
    }

    if (changes.duration !== undefined) {
      transition.duration = changes.duration;
    }
    if (changes.params !== undefined) {
      transition.params = { ...transition.params, ...changes.params };
    }

    return { ...transition, params: { ...transition.params } };
  }

  getForClip(clipId: string): Transition[] {
    const results: Transition[] = [];
    for (const transition of this.transitions.values()) {
      if (transition.clipAId === clipId || transition.clipBId === clipId) {
        results.push({ ...transition, params: { ...transition.params } });
      }
    }
    return results;
  }

  validateDuration(duration: number, clipADuration: number, clipBDuration: number): boolean {
    if (duration <= 0) {
      return false;
    }
    // Transition cannot be longer than half of either clip
    const maxDuration = Math.min(clipADuration / 2, clipBDuration / 2);
    return duration <= maxDuration;
  }
}
