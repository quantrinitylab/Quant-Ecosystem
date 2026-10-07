// ============================================================================
// @quant/shared-ui - Advanced Responsive System
// ============================================================================

import {
  Breakpoint,
  BreakpointConfig,
  MediaQueryResult,
  ResponsiveValue,
  ViewportInfo,
  SafeAreaInsets,
} from './types';

type BreakpointListener = (info: ViewportInfo) => void;
type MediaQueryListener = (result: MediaQueryResult) => void;

interface ContainerQuery {
  id: string;
  elementWidth: number;
  breakpoints: { name: string; minWidth: number }[];
  currentBreakpoint: string;
}

export class ResponsiveSystem {
  private breakpoints: Breakpoint[];
  private currentBreakpoint: string;
  private viewportWidth: number = 1024;
  private viewportHeight: number = 768;
  private orientation: 'portrait' | 'landscape' = 'landscape';
  private breakpointListeners: Set<BreakpointListener> = new Set();
  private mediaQueryListeners: Map<string, Set<MediaQueryListener>> = new Map();
  private containerQueries: Map<string, ContainerQuery> = new Map();
  private safeAreaInsets: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private prefersColorScheme: 'light' | 'dark' = 'light';
  private prefersReducedMotion: boolean = false;
  private previousBreakpoint: string = '';

  constructor(config?: BreakpointConfig) {
    this.breakpoints = config?.breakpoints || [
      { name: 'xs', minWidth: 0, maxWidth: 575 },
      { name: 'sm', minWidth: 576, maxWidth: 767 },
      { name: 'md', minWidth: 768, maxWidth: 991 },
      { name: 'lg', minWidth: 992, maxWidth: 1199 },
      { name: 'xl', minWidth: 1200, maxWidth: 1399 },
      { name: '2xl', minWidth: 1400 },
    ];
    this.currentBreakpoint = config?.defaultBreakpoint || this.detectBreakpoint();
    this.previousBreakpoint = this.currentBreakpoint;
  }

  // Detect current breakpoint from viewport width
  private detectBreakpoint(): string {
    for (let i = this.breakpoints.length - 1; i >= 0; i--) {
      const bp = this.breakpoints[i]!;
      if (this.viewportWidth >= bp.minWidth) {
        return bp.name;
      }
    }
    return this.breakpoints[0]?.name || 'xs';
  }

  // Set viewport dimensions (call on resize)
  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.orientation = width > height ? 'landscape' : 'portrait';

    const newBreakpoint = this.detectBreakpoint();
    const breakpointChanged = newBreakpoint !== this.currentBreakpoint;

    if (breakpointChanged) {
      this.previousBreakpoint = this.currentBreakpoint;
      this.currentBreakpoint = newBreakpoint;
    }

    this.notifyBreakpointListeners();

    // Update container queries
    this.containerQueries.forEach((cq) => {
      this.updateContainerBreakpoint(cq);
    });
  }

  // Get current breakpoint
  getCurrentBreakpoint(): string {
    return this.currentBreakpoint;
  }

  // Get previous breakpoint (for transition detection)
  getPreviousBreakpoint(): string {
    return this.previousBreakpoint;
  }

  // Check if current breakpoint is at or above a given breakpoint
  isAtLeast(breakpointName: string): boolean {
    const targetIndex = this.breakpoints.findIndex((b) => b.name === breakpointName);
    const currentIndex = this.breakpoints.findIndex((b) => b.name === this.currentBreakpoint);
    return currentIndex >= targetIndex;
  }

  // Check if current breakpoint is at or below a given breakpoint
  isAtMost(breakpointName: string): boolean {
    const targetIndex = this.breakpoints.findIndex((b) => b.name === breakpointName);
    const currentIndex = this.breakpoints.findIndex((b) => b.name === this.currentBreakpoint);
    return currentIndex <= targetIndex;
  }

  // Check if current breakpoint matches exactly
  isExactly(breakpointName: string): boolean {
    return this.currentBreakpoint === breakpointName;
  }

  // Check if between two breakpoints
  isBetween(minBreakpoint: string, maxBreakpoint: string): boolean {
    return this.isAtLeast(minBreakpoint) && this.isAtMost(maxBreakpoint);
  }

  // Get responsive value for current breakpoint
  getResponsiveValue<T>(values: ResponsiveValue<T>, defaultValue: T): T {
    // Check current and lower breakpoints
    const breakpointOrder = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
    const currentIdx = breakpointOrder.indexOf(this.currentBreakpoint);

    for (let i = currentIdx; i >= 0; i--) {
      const key = breakpointOrder[i] as keyof ResponsiveValue<T>;
      if (values[key] !== undefined) return values[key] as T;
    }

    return defaultValue;
  }

  // Media query matching
  matchMediaQuery(query: string): MediaQueryResult {
    const result = this.evaluateMediaQuery(query);
    return { matches: result, query };
  }

  private evaluateMediaQuery(query: string): boolean {
    // Parse common media queries
    const minWidthMatch = query.match(/min-width:\s*(\d+)px/);
    const maxWidthMatch = query.match(/max-width:\s*(\d+)px/);
    const orientationMatch = query.match(/orientation:\s*(portrait|landscape)/);
    const prefersColorMatch = query.match(/prefers-color-scheme:\s*(dark|light)/);
    const prefersMotionMatch = query.match(/prefers-reduced-motion:\s*(reduce|no-preference)/);
    const minHeightMatch = query.match(/min-height:\s*(\d+)px/);
    const maxHeightMatch = query.match(/max-height:\s*(\d+)px/);

    let matches = true;

    if (minWidthMatch) matches = matches && this.viewportWidth >= parseInt(minWidthMatch[1]!);
    if (maxWidthMatch) matches = matches && this.viewportWidth <= parseInt(maxWidthMatch[1]!);
    if (minHeightMatch) matches = matches && this.viewportHeight >= parseInt(minHeightMatch[1]!);
    if (maxHeightMatch) matches = matches && this.viewportHeight <= parseInt(maxHeightMatch[1]!);
    if (orientationMatch) matches = matches && this.orientation === orientationMatch[1];
    if (prefersColorMatch) matches = matches && this.prefersColorScheme === prefersColorMatch[1];
    if (prefersMotionMatch) {
      const wantsReduce = prefersMotionMatch[1] === 'reduce';
      matches = matches && this.prefersReducedMotion === wantsReduce;
    }

    return matches;
  }

  // Container query simulation
  registerContainer(
    id: string,
    width: number,
    breakpoints?: { name: string; minWidth: number }[],
  ): void {
    const cq: ContainerQuery = {
      id,
      elementWidth: width,
      breakpoints: breakpoints || [
        { name: 'sm', minWidth: 300 },
        { name: 'md', minWidth: 500 },
        { name: 'lg', minWidth: 700 },
      ],
      currentBreakpoint: 'sm',
    };
    this.updateContainerBreakpoint(cq);
    this.containerQueries.set(id, cq);
  }

  updateContainerWidth(id: string, width: number): void {
    const cq = this.containerQueries.get(id);
    if (!cq) return;
    cq.elementWidth = width;
    this.updateContainerBreakpoint(cq);
  }

  private updateContainerBreakpoint(cq: ContainerQuery): void {
    let current = cq.breakpoints[0]?.name || 'sm';
    for (const bp of cq.breakpoints) {
      if (cq.elementWidth >= bp.minWidth) current = bp.name;
    }
    cq.currentBreakpoint = current;
  }

  getContainerBreakpoint(id: string): string | null {
    return this.containerQueries.get(id)?.currentBreakpoint || null;
  }

  // Orientation detection
  getOrientation(): 'portrait' | 'landscape' {
    return this.orientation;
  }

  // Safe area insets (for notch handling)
  setSafeAreaInsets(insets: Partial<SafeAreaInsets>): void {
    this.safeAreaInsets = { ...this.safeAreaInsets, ...insets };
  }

  getSafeAreaInsets(): SafeAreaInsets {
    return { ...this.safeAreaInsets };
  }

  // Viewport units calculation
  getViewportUnits(): {
    vw: number;
    vh: number;
    vmin: number;
    vmax: number;
    svh: number;
    dvh: number;
  } {
    const vw = this.viewportWidth / 100;
    const vh = this.viewportHeight / 100;
    const safeHeight = this.viewportHeight - this.safeAreaInsets.top - this.safeAreaInsets.bottom;

    return {
      vw,
      vh,
      vmin: Math.min(vw, vh),
      vmax: Math.max(vw, vh),
      svh: safeHeight / 100, // Small viewport height (always safe)
      dvh: this.viewportHeight / 100, // Dynamic viewport height
    };
  }

  // Set user preferences
  setPreferences(prefs: { colorScheme?: 'light' | 'dark'; reducedMotion?: boolean }): void {
    if (prefs.colorScheme !== undefined) this.prefersColorScheme = prefs.colorScheme;
    if (prefs.reducedMotion !== undefined) this.prefersReducedMotion = prefs.reducedMotion;
  }

  getPrefersColorScheme(): 'light' | 'dark' {
    return this.prefersColorScheme;
  }
  getPrefersReducedMotion(): boolean {
    return this.prefersReducedMotion;
  }

  // Get full viewport info
  getViewportInfo(): ViewportInfo {
    return {
      width: this.viewportWidth,
      height: this.viewportHeight,
      orientation: this.orientation,
      breakpoint: this.currentBreakpoint,
      safeAreaInsets: { ...this.safeAreaInsets },
    };
  }

  // Subscribe to breakpoint changes
  onBreakpointChange(listener: BreakpointListener): () => void {
    this.breakpointListeners.add(listener);
    return () => this.breakpointListeners.delete(listener);
  }

  // Subscribe to specific media query changes
  onMediaQuery(query: string, listener: MediaQueryListener): () => void {
    if (!this.mediaQueryListeners.has(query)) {
      this.mediaQueryListeners.set(query, new Set());
    }
    this.mediaQueryListeners.get(query)!.add(listener);
    // Immediately fire with current value
    listener(this.matchMediaQuery(query));
    return () => {
      this.mediaQueryListeners.get(query)?.delete(listener);
    };
  }

  private notifyBreakpointListeners(): void {
    const info = this.getViewportInfo();
    this.breakpointListeners.forEach((listener) => listener(info));

    // Also check media queries
    this.mediaQueryListeners.forEach((listeners, query) => {
      const result = this.matchMediaQuery(query);
      listeners.forEach((listener) => listener(result));
    });
  }

  // Get all defined breakpoints
  getBreakpoints(): Breakpoint[] {
    return [...this.breakpoints];
  }

  destroy(): void {
    this.breakpointListeners.clear();
    this.mediaQueryListeners.clear();
    this.containerQueries.clear();
  }
}

export default ResponsiveSystem;
