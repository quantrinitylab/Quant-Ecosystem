export interface DeviceIntent {
  capability: string;
  action: string;
  params: Record<string, unknown>;
}

export interface GrammarPattern {
  id: string;
  pattern: string;
  capability: string;
  action: string;
  extract?: (text: string) => Record<string, unknown>;
}

export interface UserAlias {
  trigger: string;
  value: string;
  category?: string;
}

export interface CustomShortcut {
  trigger: string;
  actions: DeviceIntent[];
  description?: string;
  enabled: boolean;
  stopOnFailure: boolean;
}

export interface ParseResult {
  type: 'shortcut' | 'grammar' | 'unrecognized';
  intent?: DeviceIntent;
  shortcut?: CustomShortcut;
}

export interface ExecutionResult {
  success: boolean;
  results: Array<{ intent: DeviceIntent; success: boolean; error?: string }>;
  requiresConfirmation?: boolean;
}
