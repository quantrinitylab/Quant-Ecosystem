// ============================================================================
// @quant/shared-ui - Advanced Toast Notification System
// ============================================================================

import { ToastMessage, ToastConfig, ToastAction, ToastState } from './types';

interface ActiveToast extends ToastMessage {
  state: ToastState;
  timer: any;
}

type ToastListener = (toasts: ActiveToast[]) => void;

export class ToastManager {
  private config: ToastConfig;
  private activeToasts: Map<string, ActiveToast> = new Map();
  private queue: ToastMessage[] = [];
  private listeners: Set<ToastListener> = new Set();
  private idCounter: number = 0;
  private recentMessages: Set<string> = new Set(); // For deduplication
  private dedupeWindow: number = 2000; // ms

  constructor(config: ToastConfig = {}) {
    this.config = {
      position: 'top-right',
      maxVisible: 5,
      defaultDuration: 5000,
      gap: 12,
      animationDuration: 300,
      ...config,
    };
  }

  // Show a toast notification
  show(
    message: string,
    options: {
      type?: 'info' | 'success' | 'warning' | 'error';
      title?: string;
      duration?: number;
      action?: ToastAction;
      persistent?: boolean;
      priority?: number;
    } = {},
  ): string {
    // Deduplication check
    const dedupeKey = `${options.type || 'info'}:${message}`;
    if (this.recentMessages.has(dedupeKey)) {
      // Return existing toast ID if duplicate
      for (const [id, toast] of this.activeToasts) {
        if (toast.message === message && toast.type === (options.type || 'info')) {
          return id;
        }
      }
    }

    const id = `toast_${++this.idCounter}`;
    const toast: ToastMessage = {
      id,
      type: options.type || 'info',
      title: options.title,
      message,
      duration: options.persistent
        ? undefined
        : (options.duration ?? this.getDefaultDuration(options.type || 'info')),
      action: options.action,
      persistent: options.persistent,
      priority: options.priority ?? this.getDefaultPriority(options.type || 'info'),
      timestamp: Date.now(),
    };

    // Deduplication tracking
    this.recentMessages.add(dedupeKey);
    setTimeout(() => this.recentMessages.delete(dedupeKey), this.dedupeWindow);

    // Check if we can show immediately or queue
    if (this.activeToasts.size < (this.config.maxVisible || 5)) {
      this.activateToast(toast);
    } else {
      // Check if new toast has higher priority than lowest visible
      const lowest = this.getLowestPriorityToast();
      if (lowest && (toast.priority || 0) > (lowest.priority || 0)) {
        this.dismiss(lowest.id);
        this.activateToast(toast);
      } else {
        this.queue.push(toast);
        this.sortQueue();
      }
    }

    return id;
  }

  // Convenience methods
  info(
    message: string,
    options: Partial<Omit<Parameters<typeof this.show>[1], 'type'>> = {},
  ): string {
    return this.show(message, { ...options, type: 'info' });
  }

  success(
    message: string,
    options: Partial<Omit<Parameters<typeof this.show>[1], 'type'>> = {},
  ): string {
    return this.show(message, { ...options, type: 'success' });
  }

  warning(
    message: string,
    options: Partial<Omit<Parameters<typeof this.show>[1], 'type'>> = {},
  ): string {
    return this.show(message, { ...options, type: 'warning' });
  }

  error(
    message: string,
    options: Partial<Omit<Parameters<typeof this.show>[1], 'type'>> = {},
  ): string {
    return this.show(message, { ...options, type: 'error' });
  }

  // Activate a toast (make it visible)
  private activateToast(toast: ToastMessage): void {
    const activeToast: ActiveToast = {
      ...toast,
      state: {
        id: toast.id,
        phase: 'entering',
        offset: this.calculateOffset(toast.id),
      },
      timer: null,
    };

    this.activeToasts.set(toast.id, activeToast);
    this.recalculateOffsets();
    this.notifyListeners();

    // Transition to visible after animation
    setTimeout(() => {
      const t = this.activeToasts.get(toast.id);
      if (t) {
        t.state.phase = 'visible';
        this.notifyListeners();
      }
    }, this.config.animationDuration || 300);

    // Set auto-dismiss timer
    if (toast.duration && !toast.persistent) {
      activeToast.timer = setTimeout(() => {
        this.dismiss(toast.id);
      }, toast.duration);
    }
  }

  // Dismiss a toast
  dismiss(id: string): void {
    const toast = this.activeToasts.get(id);
    if (!toast) return;

    // Clear auto-dismiss timer
    if (toast.timer) {
      clearTimeout(toast.timer);
      toast.timer = null;
    }

    // Start exit animation
    toast.state.phase = 'exiting';
    this.notifyListeners();

    // Remove after animation
    setTimeout(() => {
      this.activeToasts.delete(id);
      this.recalculateOffsets();
      this.notifyListeners();

      // Show next from queue
      this.processQueue();
    }, this.config.animationDuration || 300);
  }

  // Dismiss all toasts
  dismissAll(): void {
    const ids = Array.from(this.activeToasts.keys());
    ids.forEach((id) => this.dismiss(id));
    this.queue = [];
  }

  // Update toast message
  update(id: string, updates: Partial<Pick<ToastMessage, 'message' | 'title' | 'type'>>): void {
    const toast = this.activeToasts.get(id);
    if (!toast) return;
    if (updates.message) toast.message = updates.message;
    if (updates.title) toast.title = updates.title;
    if (updates.type) toast.type = updates.type;
    this.notifyListeners();
  }

  // Process queue - show next queued toast
  private processQueue(): void {
    while (this.queue.length > 0 && this.activeToasts.size < (this.config.maxVisible || 5)) {
      const next = this.queue.shift();
      if (next) this.activateToast(next);
    }
  }

  // Sort queue by priority (higher priority first)
  private sortQueue(): void {
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  // Get default duration based on type
  private getDefaultDuration(type: string): number {
    switch (type) {
      case 'error':
        return (this.config.defaultDuration || 5000) * 1.5;
      case 'warning':
        return (this.config.defaultDuration || 5000) * 1.2;
      case 'success':
        return this.config.defaultDuration || 5000;
      default:
        return this.config.defaultDuration || 5000;
    }
  }

  // Get default priority based on type
  private getDefaultPriority(type: string): number {
    switch (type) {
      case 'error':
        return 4;
      case 'warning':
        return 3;
      case 'success':
        return 2;
      default:
        return 1;
    }
  }

  // Get lowest priority visible toast
  private getLowestPriorityToast(): ActiveToast | null {
    let lowest: ActiveToast | null = null;
    this.activeToasts.forEach((toast) => {
      if (!lowest || (toast.priority || 0) < (lowest.priority || 0)) {
        lowest = toast;
      }
    });
    return lowest;
  }

  // Calculate vertical offset for a toast
  private calculateOffset(id: string): number {
    let offset = 0;
    const gap = this.config.gap || 12;
    const toastHeight = 60; // Estimated toast height

    for (const [toastId, toast] of this.activeToasts) {
      if (toastId === id) break;
      if (toast.state.phase !== 'exiting') {
        offset += toastHeight + gap;
      }
    }
    return offset;
  }

  // Recalculate all toast offsets
  private recalculateOffsets(): void {
    let offset = 0;
    const gap = this.config.gap || 12;
    const toastHeight = 60;

    this.activeToasts.forEach((toast) => {
      if (toast.state.phase !== 'exiting') {
        toast.state.offset = offset;
        offset += toastHeight + gap;
      }
    });
  }

  // Get position styles based on config
  getPositionStyles(): Record<string, string> {
    const position = this.config.position || 'top-right';
    const base: Record<string, string> = { position: 'fixed', zIndex: '9999' };

    switch (position) {
      case 'top-right':
        return { ...base, top: '16px', right: '16px' };
      case 'top-left':
        return { ...base, top: '16px', left: '16px' };
      case 'bottom-right':
        return { ...base, bottom: '16px', right: '16px' };
      case 'bottom-left':
        return { ...base, bottom: '16px', left: '16px' };
      case 'top-center':
        return { ...base, top: '16px', left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-center':
        return { ...base, bottom: '16px', left: '50%', transform: 'translateX(-50%)' };
      default:
        return { ...base, top: '16px', right: '16px' };
    }
  }

  // Get active toasts in display order
  getToasts(): ActiveToast[] {
    return Array.from(this.activeToasts.values());
  }

  // Get queue length
  getQueueLength(): number {
    return this.queue.length;
  }

  // Subscribe to changes
  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const toasts = this.getToasts();
    this.listeners.forEach((listener) => listener(toasts));
  }

  // Pause auto-dismiss (e.g., on hover)
  pauseTimer(id: string): void {
    const toast = this.activeToasts.get(id);
    if (toast && toast.timer) {
      clearTimeout(toast.timer);
      toast.timer = null;
    }
  }

  // Resume auto-dismiss
  resumeTimer(id: string, remainingMs?: number): void {
    const toast = this.activeToasts.get(id);
    if (!toast || toast.persistent) return;
    const duration = remainingMs || toast.duration || this.config.defaultDuration || 5000;
    toast.timer = setTimeout(() => this.dismiss(id), duration);
  }

  destroy(): void {
    this.activeToasts.forEach((toast) => {
      if (toast.timer) clearTimeout(toast.timer);
    });
    this.activeToasts.clear();
    this.queue = [];
    this.listeners.clear();
    this.recentMessages.clear();
  }
}

export default ToastManager;
