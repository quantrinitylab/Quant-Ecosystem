// ============================================================================
// QuantEdits - Text Animations Service
// Text overlay animations with presets, styles, and duplication
// ============================================================================

export type AnimationType =
  | 'typewriter'
  | 'fade_in'
  | 'bounce'
  | 'slide_up'
  | 'slide_down'
  | 'scale'
  | 'rotate'
  | 'glitch';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export interface TextAnimation {
  id: string;
  text: string;
  animation: AnimationType;
  duration: number;
  delay: number;
  style: TextStyle;
}

interface AnimationPreset {
  name: string;
  animation: AnimationType;
  style: TextStyle;
}

const DEFAULT_PRESETS: AnimationPreset[] = [
  {
    name: 'Title Card',
    animation: 'fade_in',
    style: { fontFamily: 'Arial', fontSize: 48, color: '#ffffff', bold: true, italic: false },
  },
  {
    name: 'Subtitle',
    animation: 'slide_up',
    style: { fontFamily: 'Helvetica', fontSize: 24, color: '#cccccc', bold: false, italic: false },
  },
  {
    name: 'Typewriter Effect',
    animation: 'typewriter',
    style: {
      fontFamily: 'Courier New',
      fontSize: 32,
      color: '#00ff00',
      bold: false,
      italic: false,
    },
  },
  {
    name: 'Dramatic',
    animation: 'scale',
    style: { fontFamily: 'Georgia', fontSize: 64, color: '#ff0000', bold: true, italic: true },
  },
  {
    name: 'Glitch Title',
    animation: 'glitch',
    style: { fontFamily: 'monospace', fontSize: 40, color: '#ff00ff', bold: true, italic: false },
  },
];

export class TextAnimationsService {
  private animations: Map<string, TextAnimation> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `text-anim-${this.idCounter}`;
  }

  create(
    text: string,
    animation: AnimationType,
    style: TextStyle,
    duration?: number,
  ): TextAnimation {
    const textAnimation: TextAnimation = {
      id: this.generateId(),
      text,
      animation,
      duration: duration ?? 1000,
      delay: 0,
      style: { ...style },
    };

    this.animations.set(textAnimation.id, textAnimation);
    return this.copyAnimation(textAnimation);
  }

  update(id: string, changes: Partial<TextAnimation>): TextAnimation | null {
    const animation = this.animations.get(id);
    if (!animation) {
      return null;
    }

    if (changes.text !== undefined) animation.text = changes.text;
    if (changes.animation !== undefined) animation.animation = changes.animation;
    if (changes.duration !== undefined) animation.duration = changes.duration;
    if (changes.delay !== undefined) animation.delay = changes.delay;
    if (changes.style !== undefined) animation.style = { ...changes.style };

    return this.copyAnimation(animation);
  }

  delete(id: string): boolean {
    return this.animations.delete(id);
  }

  getPresets(): { name: string; animation: AnimationType; style: TextStyle }[] {
    return DEFAULT_PRESETS.map((p) => ({
      name: p.name,
      animation: p.animation,
      style: { ...p.style },
    }));
  }

  duplicate(id: string): TextAnimation | null {
    const original = this.animations.get(id);
    if (!original) {
      return null;
    }

    const copy: TextAnimation = {
      id: this.generateId(),
      text: original.text,
      animation: original.animation,
      duration: original.duration,
      delay: original.delay,
      style: { ...original.style },
    };

    this.animations.set(copy.id, copy);
    return this.copyAnimation(copy);
  }

  getAll(): TextAnimation[] {
    return Array.from(this.animations.values()).map((a) => this.copyAnimation(a));
  }

  private copyAnimation(animation: TextAnimation): TextAnimation {
    return {
      ...animation,
      style: { ...animation.style },
    };
  }
}
