// Quantchat - Accessibility Service
// Mobile accessibility features for messaging platform

export interface AccessibilityLabel {
  elementId: string;
  label: string;
  hint?: string;
  role: AccessibilityRole;
  value?: string;
  traits: AccessibilityTrait[];
}

export type AccessibilityRole =
  | 'button'
  | 'link'
  | 'header'
  | 'image'
  | 'text'
  | 'search'
  | 'tab'
  | 'list'
  | 'list_item'
  | 'alert'
  | 'menu'
  | 'slider'
  | 'switch'
  | 'checkbox';

export type AccessibilityTrait =
  | 'selected'
  | 'disabled'
  | 'adjustable'
  | 'loading'
  | 'modal'
  | 'updates_frequently';

export interface A11yPreferences {
  screenReaderEnabled: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  boldText: boolean;
  voiceControlEnabled: boolean;
  invertColors: boolean;
  monoAudio: boolean;
  closedCaptions: boolean;
  fontScale: number;
}

export interface VoiceCommand {
  id: string;
  phrase: string;
  aliases: string[];
  action: string;
  screen?: string;
  enabled: boolean;
}

export interface FocusConfig {
  elementId: string;
  trapFocus: boolean;
  autoFocus: boolean;
  focusOrder: number;
  returnFocusTo?: string;
}

export interface Announcement {
  message: string;
  priority: 'polite' | 'assertive';
  delay?: number;
}

export interface DynamicTypeConfig {
  baseSize: number;
  minScale: number;
  maxScale: number;
  currentScale: number;
  respectSystemSetting: boolean;
}

export interface HighContrastTheme {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  error: string;
  border: string;
  focusRing: string;
}

export class AccessibilityService {
  private labels: Map<string, AccessibilityLabel> = new Map();
  private preferences: A11yPreferences = {
    screenReaderEnabled: false,
    reduceMotion: false,
    highContrast: false,
    largeText: false,
    boldText: false,
    voiceControlEnabled: false,
    invertColors: false,
    monoAudio: false,
    closedCaptions: false,
    fontScale: 1.0,
  };
  private voiceCommands: Map<string, VoiceCommand> = new Map();
  private focusStack: FocusConfig[] = [];
  private dynamicTypeConfig: DynamicTypeConfig = { baseSize: 16, minScale: 0.8, maxScale: 2.0, currentScale: 1.0, respectSystemSetting: true };
  private announcements: Announcement[] = [];
  private highContrastTheme: HighContrastTheme = { background: '#000000', foreground: '#FFFFFF', primary: '#FFFF00', secondary: '#00FFFF', error: '#FF4444', border: '#FFFFFF', focusRing: '#FFFF00' };

  constructor() {
    this.registerDefaultVoiceCommands();
  }

  private registerDefaultVoiceCommands(): void {
    const commands: VoiceCommand[] = [
      { id: 'cmd_send_message', phrase: 'send_message', aliases: ['do send_message'], action: 'send_message', enabled: true },
      { id: 'cmd_read_messages', phrase: 'read_messages', aliases: ['do read_messages'], action: 'read_messages', enabled: true },
      { id: 'cmd_start_call', phrase: 'start_call', aliases: ['do start_call'], action: 'start_call', enabled: true },
      { id: 'cmd_go_home', phrase: 'go home', aliases: ['home', 'main screen'], action: 'navigate_home', enabled: true },
      { id: 'cmd_go_back', phrase: 'go back', aliases: ['back', 'previous'], action: 'navigate_back', enabled: true },
      { id: 'cmd_search', phrase: 'search', aliases: ['find', 'look for'], action: 'open_search', enabled: true },
      { id: 'cmd_settings', phrase: 'open settings', aliases: ['settings', 'preferences'], action: 'open_settings', enabled: true },
      { id: 'cmd_refresh', phrase: 'refresh', aliases: ['reload', 'update'], action: 'refresh_content', enabled: true },
    ];
    commands.forEach(cmd => this.voiceCommands.set(cmd.id, cmd));
  }

  public announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    const announcement: Announcement = { message, priority };
    this.announcements.push(announcement);
  }

  public setLabel(elementId: string, label: string, role: AccessibilityRole, options?: { hint?: string; value?: string; traits?: AccessibilityTrait[] }): void {
    this.labels.set(elementId, {
      elementId,
      label,
      role,
      hint: options?.hint,
      value: options?.value,
      traits: options?.traits || [],
    });
  }

  public getLabel(elementId: string): AccessibilityLabel | undefined {
    return this.labels.get(elementId);
  }

  public supportDynamicType(config?: Partial<DynamicTypeConfig>): DynamicTypeConfig {
    if (config) {
      this.dynamicTypeConfig = { ...this.dynamicTypeConfig, ...config };
    }
    return { ...this.dynamicTypeConfig };
  }

  public getScaledFontSize(baseSize: number): number {
    const scale = this.dynamicTypeConfig.respectSystemSetting ? this.preferences.fontScale : this.dynamicTypeConfig.currentScale;
    const clampedScale = Math.max(this.dynamicTypeConfig.minScale, Math.min(this.dynamicTypeConfig.maxScale, scale));
    return Math.round(baseSize * clampedScale);
  }

  public reduceMotion(): boolean {
    return this.preferences.reduceMotion;
  }

  public getAnimationDuration(normalDuration: number): number {
    if (this.preferences.reduceMotion) return 0;
    return normalDuration;
  }

  public getAnimationAlternative(animationType: string): string {
    if (!this.preferences.reduceMotion) return animationType;
    const alternatives: Record<string, string> = {
      'slide': 'fade',
      'bounce': 'fade',
      'zoom': 'fade',
      'rotate': 'none',
      'parallax': 'none',
      'spring': 'linear',
    };
    return alternatives[animationType] || 'none';
  }

  public highContrast(): boolean {
    return this.preferences.highContrast;
  }

  public getHighContrastTheme(): HighContrastTheme {
    return { ...this.highContrastTheme };
  }

  public registerVoiceCommand(command: VoiceCommand): void {
    this.voiceCommands.set(command.id, command);
  }

  public removeVoiceCommand(commandId: string): void {
    this.voiceCommands.delete(commandId);
  }

  public matchVoiceCommand(input: string): VoiceCommand | null {
    const normalized = input.toLowerCase().trim();
    for (const command of this.voiceCommands.values()) {
      if (!command.enabled) continue;
      if (command.phrase.toLowerCase() === normalized) return command;
      if (command.aliases.some(alias => alias.toLowerCase() === normalized)) return command;
    }
    return null;
  }

  public pushFocus(config: FocusConfig): void {
    this.focusStack.push(config);
  }

  public popFocus(): FocusConfig | undefined {
    return this.focusStack.pop();
  }

  public getCurrentFocus(): FocusConfig | undefined {
    return this.focusStack[this.focusStack.length - 1];
  }

  public setFocusOrder(elements: Array<{ elementId: string; order: number }>): void {
    elements.forEach(({ elementId, order }) => {
      const existing = this.focusStack.find(f => f.elementId === elementId);
      if (existing) existing.focusOrder = order;
    });
  }

  public getA11yPreferences(): A11yPreferences {
    return { ...this.preferences };
  }

  public updatePreferences(prefs: Partial<A11yPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
  }

  public getVoiceCommands(): VoiceCommand[] {
    return Array.from(this.voiceCommands.values());
  }

  public getAnnouncements(): Announcement[] {
    return [...this.announcements];
  }

  public clearAnnouncements(): void {
    this.announcements = [];
  }
}
