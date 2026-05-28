import type { PhoneFreeConfig, PhoneFreeState, BiometricAuthProvider } from './types.js';

type EventType = 'enabled' | 'disabled' | 'timeout';
type Listener = () => void;

/**
 * Biometric-gated phone-free mode state machine.
 * Session management (start/end/logging) is handled externally by an
 * orchestration layer that listens to 'enabled', 'disabled', and 'timeout' events.
 */
export class PhoneFreeModeController {
  private state: PhoneFreeState;
  private listeners: Map<EventType, Listener[]> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: PhoneFreeConfig) {
    this.state = { enabled: false, activatedAt: null, config, sessionId: null };
  }

  async enable(biometric: BiometricAuthProvider): Promise<boolean> {
    if (this.state.enabled) return false;
    const ok = await biometric.authenticate();
    if (!ok) return false;
    this.state.enabled = true;
    this.state.activatedAt = Date.now();
    this.state.sessionId = crypto.randomUUID();
    this.emit('enabled');
    if (this.state.config.timeout > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.state.enabled = false;
        this.state.activatedAt = null;
        this.state.sessionId = null;
        this.emit('timeout');
      }, this.state.config.timeout);
    }
    return true;
  }

  async disable(biometric: BiometricAuthProvider): Promise<boolean> {
    const ok = await biometric.authenticate();
    if (!ok) return false;
    this.clearTimer();
    this.state.enabled = false;
    this.state.activatedAt = null;
    this.state.sessionId = null;
    this.emit('disabled');
    return true;
  }

  getState(): PhoneFreeState {
    return { ...this.state };
  }

  on(event: EventType, listener: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  off(event: EventType, listener: Listener): void {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((l) => l !== listener),
    );
  }

  private emit(event: EventType): void {
    for (const l of this.listeners.get(event) ?? []) l();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
