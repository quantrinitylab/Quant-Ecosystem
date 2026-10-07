// ============================================================================
// @quant/shared-ui - Advanced Animation Engine with Spring Physics
// ============================================================================

import { AnimationConfig, Spring, SpringConfig, Timeline, EasingFunction } from './types';

// Easing functions library
const easingFunctions: Record<string, (t: number) => number> = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - --t * t * t * t,
  easeInOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t),
  easeInQuint: (t: number) => t * t * t * t * t,
  easeOutQuint: (t: number) => 1 + --t * t * t * t * t,
  easeInOutQuint: (t: number) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t),
  easeInExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t: number) => {
    if (t === 0 || t === 1) return t;
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeInSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t: number) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInCirc: (t: number) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t: number) => Math.sqrt(1 - --t * t),
  easeInOutCirc: (t: number) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  easeInElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
  },
  easeOutElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  easeInOutElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    if (t < 0.5) {
      return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2;
    }
    return (
      (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1
    );
  },
  easeInBounce: (t: number) => 1 - easingFunctions.easeOutBounce!(1 - t),
  easeOutBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: (t: number) =>
    t < 0.5
      ? (1 - easingFunctions.easeOutBounce!(1 - 2 * t)) / 2
      : (1 + easingFunctions.easeOutBounce!(2 * t - 1)) / 2,
  easeInBack: (t: number) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutBack: (t: number) => {
    const c2 = 1.70158 * 1.525;
    if (t < 0.5) return (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2;
    return (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
};

// Spring state for simulation
interface SpringState {
  position: number;
  velocity: number;
}

// Animation instance tracking
interface ActiveAnimation {
  id: string;
  startTime: number;
  duration: number;
  delay: number;
  easing: string;
  properties: Record<string, [number, number]>;
  iterations: number;
  currentIteration: number;
  direction: 'normal' | 'reverse' | 'alternate';
  fill: 'none' | 'forwards' | 'backwards' | 'both';
  onUpdate: (values: Record<string, number>) => void;
  onComplete?: () => void;
  state: 'running' | 'paused' | 'completed';
  pausedAt?: number;
}

export class AnimationEngine {
  private animations: Map<string, ActiveAnimation> = new Map();
  private springs: Map<string, Spring> = new Map();
  private timelines: Map<string, Timeline> = new Map();
  private rafId: number | null = null;
  private lastFrameTime: number = 0;
  private frameSkipThreshold: number = 50; // ms
  private isRunning: boolean = false;
  private animationIdCounter: number = 0;

  constructor() {
    this.tick = this.tick.bind(this);
  }

  // Get easing function by name
  getEasing(name: EasingFunction | string): (t: number) => number {
    return easingFunctions[name] ?? easingFunctions.linear!;
  }

  // Create and start a keyframe animation
  animate(
    properties: Record<string, [number, number]>,
    config: AnimationConfig & {
      onUpdate: (values: Record<string, number>) => void;
      onComplete?: () => void;
    },
  ): string {
    const id = `anim_${++this.animationIdCounter}`;
    const animation: ActiveAnimation = {
      id,
      startTime: -1, // Set on first frame
      duration: config.duration || 300,
      delay: config.delay || 0,
      easing: config.easing || 'linear',
      properties,
      iterations: config.iterations || 1,
      currentIteration: 0,
      direction: config.direction || 'normal',
      fill: config.fill || 'none',
      onUpdate: config.onUpdate,
      onComplete: config.onComplete,
      state: 'running',
    };
    this.animations.set(id, animation);
    this.startLoop();
    return id;
  }

  // Create a spring animation
  createSpring(id: string, config: SpringConfig & { from?: number; to?: number } = {}): Spring {
    const spring: Spring = {
      mass: config.mass || 1,
      tension: config.tension || 170,
      friction: config.friction || 26,
      velocity: 0,
      position: config.from || 0,
      target: config.to || 1,
      atRest: false,
    };
    this.springs.set(id, spring);
    return spring;
  }

  // Simulate spring using Runge-Kutta 4th order integration
  simulateSpring(spring: Spring, dt: number): SpringState {
    const { mass, tension, friction, position, velocity, target } = spring;

    // RK4 integration for accurate spring physics
    const acceleration = (pos: number, vel: number): number => {
      const springForce = -tension * (pos - target);
      const dampingForce = -friction * vel;
      return (springForce + dampingForce) / mass;
    };

    // k1
    const k1v = acceleration(position, velocity);
    const k1x = velocity;

    // k2
    const k2v = acceleration(position + k1x * dt * 0.5, velocity + k1v * dt * 0.5);
    const k2x = velocity + k1v * dt * 0.5;

    // k3
    const k3v = acceleration(position + k2x * dt * 0.5, velocity + k2v * dt * 0.5);
    const k3x = velocity + k2v * dt * 0.5;

    // k4
    const k4v = acceleration(position + k3x * dt, velocity + k3v * dt);
    const k4x = velocity + k3v * dt;

    // Combine
    const newVelocity = velocity + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    const newPosition = position + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);

    return { position: newPosition, velocity: newVelocity };
  }

  // Step spring forward and check if at rest
  stepSpring(id: string, dt: number = 1 / 60, precision: number = 0.01): Spring | null {
    const spring = this.springs.get(id);
    if (!spring || spring.atRest) return spring || null;

    const result = this.simulateSpring(spring, dt);
    spring.position = result.position;
    spring.velocity = result.velocity;

    // Check if at rest
    const isAtRest =
      Math.abs(spring.velocity) < precision &&
      Math.abs(spring.position - spring.target) < precision;

    if (isAtRest) {
      spring.position = spring.target;
      spring.velocity = 0;
      spring.atRest = true;
    }

    return spring;
  }

  // Animate spring to a new target
  springTo(
    id: string,
    target: number,
    onUpdate: (value: number) => void,
    onComplete?: () => void,
  ): void {
    const spring = this.springs.get(id);
    if (!spring) return;
    spring.target = target;
    spring.atRest = false;

    const animId = `spring_${id}_${++this.animationIdCounter}`;
    const animation: ActiveAnimation = {
      id: animId,
      startTime: -1,
      duration: Infinity, // Springs run until at rest
      delay: 0,
      easing: 'linear',
      properties: { value: [spring.position, target] },
      iterations: 1,
      currentIteration: 0,
      direction: 'normal',
      fill: 'forwards',
      onUpdate: (values) => onUpdate(values.value!),
      onComplete,
      state: 'running',
    };

    // Set up spring animation
    this.animations.set(animId, animation);
    this.startLoop();
  }

  // Create a stagger effect (delays each animation in sequence)
  stagger(
    count: number,
    staggerDelay: number,
    properties: Record<string, [number, number]>,
    config: AnimationConfig & {
      onUpdate: (index: number, values: Record<string, number>) => void;
      onComplete?: () => void;
    },
  ): string[] {
    const ids: string[] = [];
    let completed = 0;
    for (let i = 0; i < count; i++) {
      const id = this.animate(properties, {
        ...config,
        delay: (config.delay || 0) + i * staggerDelay,
        onUpdate: (values) => config.onUpdate(i, values),
        onComplete: () => {
          completed++;
          if (completed === count && config.onComplete) {
            config.onComplete();
          }
        },
      });
      ids.push(id);
    }
    return ids;
  }

  // Sequence animations (one after another)
  sequence(
    animations: Array<{
      properties: Record<string, [number, number]>;
      config: AnimationConfig & { onUpdate: (values: Record<string, number>) => void };
    }>,
    onComplete?: () => void,
  ): void {
    let currentIndex = 0;
    const runNext = () => {
      if (currentIndex >= animations.length) {
        onComplete?.();
        return;
      }
      const { properties, config } = animations[currentIndex]!;
      currentIndex++;
      this.animate(properties, { ...config, onComplete: runNext });
    };
    runNext();
  }

  // Parallel animations (all at once)
  parallel(
    animations: Array<{
      properties: Record<string, [number, number]>;
      config: AnimationConfig & {
        onUpdate: (values: Record<string, number>) => void;
        onComplete?: () => void;
      };
    }>,
    onComplete?: () => void,
  ): string[] {
    let completed = 0;
    const ids: string[] = [];
    for (const { properties, config } of animations) {
      const id = this.animate(properties, {
        ...config,
        onComplete: () => {
          completed++;
          config.onComplete?.();
          if (completed === animations.length) onComplete?.();
        },
      });
      ids.push(id);
    }
    return ids;
  }

  // Create animation timeline
  createTimeline(id: string, duration: number): Timeline {
    const timeline: Timeline = {
      id,
      duration,
      currentTime: 0,
      playbackRate: 1,
      state: 'idle',
      animations: [],
    };
    this.timelines.set(id, timeline);
    return timeline;
  }

  // Add animation to timeline
  addToTimeline(
    timelineId: string,
    startTime: number,
    target: string,
    properties: Record<string, [number, number]>,
    config: AnimationConfig,
  ): void {
    const timeline = this.timelines.get(timelineId);
    if (!timeline) return;
    timeline.animations.push({
      startTime,
      animation: config,
      target,
      properties,
    });
  }

  // Play timeline
  playTimeline(
    id: string,
    onUpdate: (time: number, values: Map<string, Record<string, number>>) => void,
  ): void {
    const timeline = this.timelines.get(id);
    if (!timeline) return;
    timeline.state = 'running';
    const startTime = Date.now() - timeline.currentTime;

    const tick = () => {
      if (timeline.state !== 'running') return;
      const elapsed = (Date.now() - startTime) * timeline.playbackRate;
      timeline.currentTime = Math.min(elapsed, timeline.duration);

      const values = new Map<string, Record<string, number>>();
      for (const entry of timeline.animations) {
        const entryDuration = entry.animation.duration || 300;
        const localTime = timeline.currentTime - entry.startTime;
        if (localTime < 0 || localTime > entryDuration) continue;
        const progress = localTime / entryDuration;
        const easing = this.getEasing(entry.animation.easing || 'linear');
        const easedProgress = easing(Math.min(1, Math.max(0, progress)));
        const propValues: Record<string, number> = {};
        for (const [prop, [from, to]] of Object.entries(entry.properties)) {
          propValues[prop] = from + (to - from) * easedProgress;
        }
        values.set(entry.target, propValues);
      }
      onUpdate(timeline.currentTime, values);

      if (timeline.currentTime >= timeline.duration) {
        timeline.state = 'finished';
      } else {
        setTimeout(tick, 16);
      }
    };
    tick();
  }

  // Pause/resume timeline
  pauseTimeline(id: string): void {
    const timeline = this.timelines.get(id);
    if (timeline) timeline.state = 'paused';
  }

  seekTimeline(id: string, time: number): void {
    const timeline = this.timelines.get(id);
    if (timeline) timeline.currentTime = Math.max(0, Math.min(time, timeline.duration));
  }

  setTimelineSpeed(id: string, rate: number): void {
    const timeline = this.timelines.get(id);
    if (timeline) timeline.playbackRate = rate;
  }

  // Interpolate between colors (hex format)
  interpolateColor(from: string, to: string, t: number): string {
    const fromRGB = this.hexToRgb(from);
    const toRGB = this.hexToRgb(to);
    if (!fromRGB || !toRGB) return from;
    const r = Math.round(fromRGB.r + (toRGB.r - fromRGB.r) * t);
    const g = Math.round(fromRGB.g + (toRGB.g - fromRGB.g) * t);
    const b = Math.round(fromRGB.b + (toRGB.b - fromRGB.b) * t);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    return {
      r: parseInt(result[1]!, 16),
      g: parseInt(result[2]!, 16),
      b: parseInt(result[3]!, 16),
    };
  }

  // Interpolate arrays element-wise
  interpolateArray(from: number[], to: number[], t: number): number[] {
    return from.map((val, i) => val + ((to[i] ?? 0) - val) * t);
  }

  // RAF-based animation loop
  private startLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = Date.now();
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    this.rafId =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(this.tick)
        : (setTimeout(this.tick, 16) as any);
  }

  private tick(): void {
    const now = Date.now();
    const deltaTime = now - this.lastFrameTime;

    // Frame skipping - if too much time has passed, cap the delta
    const dt = deltaTime > this.frameSkipThreshold ? this.frameSkipThreshold : deltaTime;
    this.lastFrameTime = now;

    let hasActive = false;

    this.animations.forEach((animation) => {
      if (animation.state !== 'running') return;
      hasActive = true;

      if (animation.startTime === -1) {
        animation.startTime = now;
      }

      const elapsed = now - animation.startTime - animation.delay;
      if (elapsed < 0) return; // Still in delay

      this.tickAnimation(animation, elapsed, now);
    });

    // Step springs
    this.springs.forEach((spring, id) => {
      if (!spring.atRest) {
        hasActive = true;
        this.stepSpring(id, dt / 1000);
      }
    });

    if (hasActive) {
      this.scheduleFrame();
    } else {
      this.isRunning = false;
    }
  }

  private tickAnimation(animation: ActiveAnimation, elapsed: number, _now: number): void {
    const { duration, easing, properties, iterations, direction } = animation;

    if (duration === Infinity) {
      // Spring-based animation, handled by spring stepper
      return;
    }

    let progress = elapsed / duration;
    const iterationProgress = progress % 1;
    const currentIteration = Math.floor(progress);

    if (currentIteration >= iterations && iterations !== Infinity) {
      // Animation complete
      const finalValues: Record<string, number> = {};
      for (const [prop, [from, to]] of Object.entries(properties)) {
        finalValues[prop] = animation.fill === 'forwards' || animation.fill === 'both' ? to : from;
      }
      animation.onUpdate(finalValues);
      animation.state = 'completed';
      animation.onComplete?.();
      this.animations.delete(animation.id);
      return;
    }

    // Determine direction for this iteration
    let t = iterationProgress;
    if (direction === 'reverse') {
      t = 1 - t;
    } else if (direction === 'alternate') {
      t = currentIteration % 2 === 0 ? t : 1 - t;
    }

    // Apply easing
    const easingFn = this.getEasing(easing);
    const easedT = easingFn(t);

    // Calculate values
    const values: Record<string, number> = {};
    for (const [prop, [from, to]] of Object.entries(properties)) {
      values[prop] = from + (to - from) * easedT;
    }

    animation.onUpdate(values);
  }

  // Pause an animation
  pause(id: string): void {
    const animation = this.animations.get(id);
    if (animation && animation.state === 'running') {
      animation.state = 'paused';
      animation.pausedAt = Date.now();
    }
  }

  // Resume an animation
  resume(id: string): void {
    const animation = this.animations.get(id);
    if (animation && animation.state === 'paused' && animation.pausedAt) {
      const pauseDuration = Date.now() - animation.pausedAt;
      animation.startTime += pauseDuration;
      animation.state = 'running';
      animation.pausedAt = undefined;
      this.startLoop();
    }
  }

  // Cancel an animation
  cancel(id: string): void {
    this.animations.delete(id);
  }

  // Cancel all animations
  cancelAll(): void {
    this.animations.clear();
    this.springs.clear();
    this.isRunning = false;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  // Gesture-based spring animation
  gestureRelease(
    id: string,
    initialVelocity: number,
    target: number,
    onUpdate: (value: number) => void,
    onComplete?: () => void,
  ): void {
    const spring = this.springs.get(id) || this.createSpring(id);
    spring.velocity = initialVelocity;
    spring.target = target;
    spring.atRest = false;
    this.springTo(id, target, onUpdate, onComplete);
  }

  destroy(): void {
    this.cancelAll();
    this.timelines.clear();
  }
}

export default AnimationEngine;
