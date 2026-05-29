import type { PhoneFreeConfig } from '../types.js';

export class PhoneFreeController {
  private config: PhoneFreeConfig = {
    screenOff: false,
    allowedCommands: [],
    audioOutput: 'speaker',
    sessionTimeoutMs: 300000,
    sessionStartedAt: null,
  };

  private voiceOnly = false;
  private briefOnStart = false;
  private _continuityDeviceId: string | null = null;
  private commandsExecuted = 0;
  private appsUsed: Set<string> = new Set();

  activate(): void {
    this.config.screenOff = true;
    this.config.sessionStartedAt = Date.now();
  }

  deactivate(): void {
    this.config.screenOff = false;
    this.config.sessionStartedAt = null;
    this.voiceOnly = false;
    this.commandsExecuted = 0;
    this.appsUsed.clear();
  }

  isActive(): boolean {
    return this.config.screenOff;
  }

  setAllowedCommands(commands: string[]): void {
    this.config.allowedCommands = [...commands];
  }

  addAllowedCommand(command: string): void {
    if (!this.config.allowedCommands.includes(command)) {
      this.config.allowedCommands.push(command);
    }
  }

  isCommandAllowed(command: string): boolean {
    if (!this.config.screenOff) return true;
    return this.config.allowedCommands.includes(command);
  }

  setAudioOutput(output: 'speaker' | 'bluetooth' | 'watch'): void {
    this.config.audioOutput = output;
  }

  getAudioOutput(): 'speaker' | 'bluetooth' | 'watch' {
    return this.config.audioOutput;
  }

  setSessionTimeout(ms: number): void {
    this.config.sessionTimeoutMs = ms;
  }

  isSessionExpired(): boolean {
    if (!this.config.sessionStartedAt) return false;
    return Date.now() - this.config.sessionStartedAt >= this.config.sessionTimeoutMs;
  }

  getSessionDuration(): number {
    if (!this.config.sessionStartedAt) return 0;
    return Date.now() - this.config.sessionStartedAt;
  }

  getRemainingTime(): number {
    if (!this.config.sessionStartedAt) return 0;
    const elapsed = Date.now() - this.config.sessionStartedAt;
    return Math.max(0, this.config.sessionTimeoutMs - elapsed);
  }

  // Phone-free voice-only session enhancements

  enableVoiceOnlySession(config?: { briefOnStart?: boolean; continuityDeviceId?: string }): void {
    this.voiceOnly = true;
    this.briefOnStart = config?.briefOnStart ?? false;
    this._continuityDeviceId = config?.continuityDeviceId ?? null;
    if (!this.config.screenOff) {
      this.activate();
    }
  }

  isVoiceOnlySession(): boolean {
    return this.voiceOnly;
  }

  getProactiveBrief(): {
    available: boolean;
    sections: string[];
    priority: string;
  } {
    if (!this.briefOnStart || !this.voiceOnly) {
      return { available: false, sections: [], priority: 'none' };
    }
    return {
      available: true,
      sections: ['calendar', 'messages', 'tasks', 'weather'],
      priority: 'medium',
    };
  }

  handleContinuity(targetDeviceId: string): {
    success: boolean;
    sessionTransferred: boolean;
    targetDevice: string;
  } {
    if (!this.config.screenOff) {
      return {
        success: false,
        sessionTransferred: false,
        targetDevice: targetDeviceId,
      };
    }
    this._continuityDeviceId = targetDeviceId;
    return {
      success: true,
      sessionTransferred: true,
      targetDevice: targetDeviceId,
    };
  }

  getContextualResponse(currentApp: string, query: string): string {
    this.appsUsed.add(currentApp);
    this.commandsExecuted++;
    const responses: Record<string, string> = {
      calendar: `Here are your upcoming events related to "${query}".`,
      mail: `Checking your email for "${query}".`,
      chat: `Looking for messages about "${query}".`,
      drive: `Searching your files for "${query}".`,
    };
    return responses[currentApp] ?? `Processing "${query}" in ${currentApp}.`;
  }

  getSessionSummary(): {
    duration: number;
    commandsExecuted: number;
    appsUsed: string[];
    continuityDevice: string | null;
  } {
    return {
      duration: this.getSessionDuration(),
      commandsExecuted: this.commandsExecuted,
      appsUsed: [...this.appsUsed],
      continuityDevice: this._continuityDeviceId,
    };
  }
}
