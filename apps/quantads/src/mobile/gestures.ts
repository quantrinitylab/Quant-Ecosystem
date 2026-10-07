// Quantads - Gesture Service
// Mobile gesture handling for advertising platform

export interface SwipeEvent {
  direction: SwipeDirection;
  velocity: number;
  distance: number;
  startPoint: Point;
  endPoint: Point;
  timestamp: number;
}

export interface Point {
  x: number;
  y: number;
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface PinchEvent {
  scale: number;
  center: Point;
  velocity: number;
  state: GestureState;
}

export interface LongPressEvent {
  point: Point;
  duration: number;
  state: GestureState;
}

export interface DoubleTapEvent {
  point: Point;
  tapInterval: number;
}

export interface PanEvent {
  translation: Point;
  velocity: Point;
  state: GestureState;
  absolutePosition: Point;
}

export interface EdgeSwipeEvent {
  edge: 'left' | 'right' | 'top' | 'bottom';
  progress: number;
  velocity: number;
}

export type GestureState = 'began' | 'changed' | 'ended' | 'cancelled' | 'failed';

export interface GestureConfig {
  id: string;
  type: GestureType;
  priority: number;
  enabled: boolean;
  options: Record<string, unknown>;
}

export type GestureType = 'swipe' | 'pinch' | 'long_press' | 'double_tap' | 'pan' | 'edge_swipe' | 'rotation';

export interface SwipeConfig {
  minVelocity: number;
  minDistance: number;
  maxDeviation: number;
  directions: SwipeDirection[];
}

export interface PinchConfig {
  minScale: number;
  maxScale: number;
  enabled: boolean;
}

export interface LongPressConfig {
  minDuration: number;
  maxMovement: number;
  numberOfTouches: number;
}

export interface GestureConflictRule {
  gesture1: string;
  gesture2: string;
  resolution: 'simultaneous' | 'exclusive' | 'wait_for_failure';
}

export class GestureService {
  private registeredGestures: Map<string, GestureConfig> = new Map();
  private swipeHandlers: Map<SwipeDirection, Array<(event: SwipeEvent) => void>> = new Map();
  private conflictRules: GestureConflictRule[] = [];
  private swipeConfig: SwipeConfig = { minVelocity: 300, minDistance: 50, maxDeviation: 100, directions: ['left', 'right', 'up', 'down'] };
  private pinchConfig: PinchConfig = { minScale: 0.5, maxScale: 3.0, enabled: true };
  private longPressConfig: LongPressConfig = { minDuration: 500, maxMovement: 10, numberOfTouches: 1 };
  private activeGestures: Set<string> = new Set();

  constructor() {
    this.registerDefaultGestures();
  }

  private registerDefaultGestures(): void {
    this.registerGesture({ id: 'swipe_left_dismiss', type: 'swipe', priority: 10, enabled: true, options: { direction: 'left', action: 'dismiss' } });
    this.registerGesture({ id: 'swipe_right_approve', type: 'swipe', priority: 10, enabled: true, options: { direction: 'right', action: 'approve' } });
    this.registerGesture({ id: 'double_tap_quick_edit', type: 'double_tap', priority: 5, enabled: true, options: { action: 'quick_edit' } });
    this.registerGesture({ id: 'long_press_duplicate', type: 'long_press', priority: 8, enabled: true, options: { action: 'duplicate' } });
    this.registerGesture({ id: 'pinch_zoom', type: 'pinch', priority: 15, enabled: true, options: { action: 'zoom' } });
    this.registerGesture({ id: 'edge_swipe_back', type: 'edge_swipe', priority: 20, enabled: true, options: { edge: 'left', action: 'navigate_back' } });
    this.registerGesture({ id: 'pan_scroll', type: 'pan', priority: 3, enabled: true, options: { action: 'scroll' } });
  }

  public onSwipe(direction: SwipeDirection, handler: (event: SwipeEvent) => void): () => void {
    if (!this.swipeHandlers.has(direction)) {
      this.swipeHandlers.set(direction, []);
    }
    this.swipeHandlers.get(direction)!.push(handler);
    return () => {
      const handlers = this.swipeHandlers.get(direction);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx > -1) handlers.splice(idx, 1);
      }
    };
  }

  public processSwipe(event: SwipeEvent): boolean {
    if (event.velocity < this.swipeConfig.minVelocity) return false;
    if (event.distance < this.swipeConfig.minDistance) return false;
    if (!this.swipeConfig.directions.includes(event.direction)) return false;
    const handlers = this.swipeHandlers.get(event.direction);
    if (handlers) {
      handlers.forEach(h => h(event));
      return true;
    }
    return false;
  }

  public onPinch(handler: (event: PinchEvent) => void): () => void {
    const id = 'pinch_handler_' + Date.now();
    this.registerGesture({ id, type: 'pinch', priority: 15, enabled: true, options: { handler } });
    return () => this.unregisterGesture(id);
  }

  public processPinch(event: PinchEvent): boolean {
    if (!this.pinchConfig.enabled) return false;
    const clampedScale = Math.max(this.pinchConfig.minScale, Math.min(this.pinchConfig.maxScale, event.scale));
    void clampedScale;
    return true;
  }

  public onLongPress(handler: (event: LongPressEvent) => void): () => void {
    const id = 'long_press_handler_' + Date.now();
    this.registerGesture({ id, type: 'long_press', priority: 8, enabled: true, options: { handler } });
    return () => this.unregisterGesture(id);
  }

  public processLongPress(event: LongPressEvent): boolean {
    if (event.duration < this.longPressConfig.minDuration) return false;
    return true;
  }

  public onDoubleTap(handler: (event: DoubleTapEvent) => void): () => void {
    const id = 'double_tap_handler_' + Date.now();
    this.registerGesture({ id, type: 'double_tap', priority: 5, enabled: true, options: { handler } });
    return () => this.unregisterGesture(id);
  }

  public onPan(handler: (event: PanEvent) => void): () => void {
    const id = 'pan_handler_' + Date.now();
    this.registerGesture({ id, type: 'pan', priority: 3, enabled: true, options: { handler } });
    return () => this.unregisterGesture(id);
  }

  public onEdgeSwipe(edge: 'left' | 'right' | 'top' | 'bottom', handler: (event: EdgeSwipeEvent) => void): () => void {
    const id = `edge_swipe_${edge}_${Date.now()}`;
    this.registerGesture({ id, type: 'edge_swipe', priority: 20, enabled: true, options: { edge, handler } });
    return () => this.unregisterGesture(id);
  }

  public registerGesture(config: GestureConfig): void {
    this.registeredGestures.set(config.id, config);
  }

  public unregisterGesture(id: string): void {
    this.registeredGestures.delete(id);
  }

  public setGestureEnabled(id: string, enabled: boolean): void {
    const gesture = this.registeredGestures.get(id);
    if (gesture) gesture.enabled = enabled;
  }

  public addConflictRule(rule: GestureConflictRule): void {
    this.conflictRules.push(rule);
  }

  public resolveConflict(gesture1Id: string, gesture2Id: string): string | null {
    const rule = this.conflictRules.find(r =>
      (r.gesture1 === gesture1Id && r.gesture2 === gesture2Id) ||
      (r.gesture1 === gesture2Id && r.gesture2 === gesture1Id)
    );
    if (!rule) return null;
    if (rule.resolution === 'exclusive') {
      const g1 = this.registeredGestures.get(gesture1Id);
      const g2 = this.registeredGestures.get(gesture2Id);
      return (g1?.priority || 0) >= (g2?.priority || 0) ? gesture1Id : gesture2Id;
    }
    return rule.resolution === 'simultaneous' ? 'both' : 'wait';
  }

  public configureSwipe(config: Partial<SwipeConfig>): void {
    this.swipeConfig = { ...this.swipeConfig, ...config };
  }

  public configurePinch(config: Partial<PinchConfig>): void {
    this.pinchConfig = { ...this.pinchConfig, ...config };
  }

  public configureLongPress(config: Partial<LongPressConfig>): void {
    this.longPressConfig = { ...this.longPressConfig, ...config };
  }

  public getRegisteredGestures(): GestureConfig[] {
    return Array.from(this.registeredGestures.values());
  }

  public getActiveGestures(): string[] {
    return Array.from(this.activeGestures);
  }
}
