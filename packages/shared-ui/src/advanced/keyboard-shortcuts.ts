// ============================================================================
// @quant/shared-ui - Advanced Keyboard Shortcut Manager
// ============================================================================

import { ShortcutBinding, ShortcutScope, ShortcutCombo, ShortcutSequence } from './types';

interface ConflictInfo {
  binding1: ShortcutBinding;
  binding2: ShortcutBinding;
  scope: string;
  combo: string;
}

interface SequenceState {
  sequence: ShortcutSequence;
  currentIndex: number;
  timer: any;
}

type ShortcutListener = (binding: ShortcutBinding) => void;

export class KeyboardShortcutManager {
  private scopes: Map<string, ShortcutScope> = new Map();
  private globalBindings: Map<string, ShortcutBinding> = new Map();
  private sequences: ShortcutSequence[] = [];
  private activeSequence: SequenceState | null = null;
  private listeners: Set<ShortcutListener> = new Set();
  private isMac: boolean;
  private enabled: boolean = true;
  private disabledBindings: Set<string> = new Set();
  private preventedDefaults: Set<string> = new Set();

  constructor(options?: { isMac?: boolean }) {
    // Detect platform
    this.isMac =
      options?.isMac ??
      (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || ''));

    // Initialize global scope
    this.scopes.set('global', {
      id: 'global',
      label: 'Global',
      active: true,
      bindings: [],
    });
  }

  // Parse a combo string like "Ctrl+Shift+K" into structured format
  parseComboString(comboStr: string): ShortcutCombo {
    const parts = comboStr.split('+').map((p) => p.trim().toLowerCase());
    const combo: ShortcutCombo = {
      key: '',
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    };

    for (const part of parts) {
      switch (part) {
        case 'ctrl':
        case 'control':
          combo.ctrl = true;
          break;
        case 'cmd':
        case 'command':
        case 'meta':
          combo.meta = true;
          break;
        case 'shift':
          combo.shift = true;
          break;
        case 'alt':
        case 'option':
          combo.alt = true;
          break;
        default:
          combo.key = part;
      }
    }

    return combo;
  }

  // Normalize combo for cross-platform (Cmd on Mac = Ctrl on Windows)
  normalizeCombo(combo: ShortcutCombo): ShortcutCombo {
    if (this.isMac) {
      // On Mac, if ctrl is specified but not meta, treat as Cmd
      if (combo.ctrl && !combo.meta) {
        return { ...combo, ctrl: false, meta: true };
      }
    } else {
      // On Windows/Linux, if meta is specified, treat as Ctrl
      if (combo.meta && !combo.ctrl) {
        return { ...combo, meta: false, ctrl: true };
      }
    }
    return combo;
  }

  // Convert combo to display string
  comboToString(combo: ShortcutCombo): string {
    const parts: string[] = [];
    if (this.isMac) {
      if (combo.ctrl) parts.push('\u2303'); // Control symbol
      if (combo.alt) parts.push('\u2325'); // Option symbol
      if (combo.shift) parts.push('\u21E7'); // Shift symbol
      if (combo.meta) parts.push('\u2318'); // Command symbol
    } else {
      if (combo.ctrl || combo.meta) parts.push('Ctrl');
      if (combo.alt) parts.push('Alt');
      if (combo.shift) parts.push('Shift');
    }
    // Capitalize key
    parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : this.formatKeyName(combo.key));
    return parts.join(this.isMac ? '' : '+');
  }

  private formatKeyName(key: string): string {
    const keyNames: Record<string, string> = {
      escape: 'Esc',
      enter: 'Enter',
      space: 'Space',
      backspace: 'Backspace',
      delete: 'Del',
      tab: 'Tab',
      arrowup: '\u2191',
      arrowdown: '\u2193',
      arrowleft: '\u2190',
      arrowright: '\u2192',
      home: 'Home',
      end: 'End',
      pageup: 'PgUp',
      pagedown: 'PgDn',
    };
    return keyNames[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }

  // Register a shortcut binding
  register(
    comboStr: string,
    handler: () => void,
    options: { scope?: string; description?: string; id?: string; preventDefault?: boolean } = {},
  ): string {
    const combo = this.normalizeCombo(this.parseComboString(comboStr));
    const scope = options.scope || 'global';
    const id = options.id || `shortcut_${this.globalBindings.size + 1}`;

    const binding: ShortcutBinding = {
      id,
      combo,
      handler,
      scope,
      description: options.description,
      enabled: true,
      preventDefault: options.preventDefault ?? true,
    };

    // Add to scope
    if (!this.scopes.has(scope)) {
      this.scopes.set(scope, {
        id: scope,
        label: scope,
        active: false,
        bindings: [],
      });
    }
    this.scopes.get(scope)!.bindings.push(binding);
    this.globalBindings.set(id, binding);

    // Track prevented defaults
    if (binding.preventDefault) {
      this.preventedDefaults.add(this.comboKey(combo));
    }

    return id;
  }

  // Unregister a shortcut
  unregister(id: string): void {
    const binding = this.globalBindings.get(id);
    if (!binding) return;

    this.globalBindings.delete(id);
    const scope = this.scopes.get(binding.scope || 'global');
    if (scope) {
      scope.bindings = scope.bindings.filter((b) => b.id !== id);
    }
  }

  // Register a key sequence (Vim-style: g then g)
  registerSequence(
    combos: string[],
    handler: () => void,
    options?: { id?: string; scope?: string; timeout?: number },
  ): string {
    const id = options?.id || `seq_${this.sequences.length + 1}`;
    const sequence: ShortcutSequence = {
      id,
      combos: combos.map((c) => this.normalizeCombo(this.parseComboString(c))),
      handler,
      timeout: options?.timeout || 1000,
      scope: options?.scope,
    };
    this.sequences.push(sequence);
    return id;
  }

  // Handle a key event
  handleKeyEvent(event: {
    key: string;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }): boolean {
    if (!this.enabled) return false;

    const pressedCombo: ShortcutCombo = {
      key: event.key.toLowerCase(),
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    };

    // Check sequences first
    if (this.handleSequence(pressedCombo)) return true;

    // Find matching bindings in active scopes
    const matchingBindings = this.findMatchingBindings(pressedCombo);

    if (matchingBindings.length > 0) {
      // Execute the most specific match (deepest scope)
      const binding = matchingBindings[0]!;
      if (binding.enabled && !this.disabledBindings.has(binding.id)) {
        binding.handler();
        this.listeners.forEach((listener) => listener(binding));
        return binding.preventDefault !== false;
      }
    }

    return false;
  }

  // Handle sequence matching
  private handleSequence(pressedCombo: ShortcutCombo): boolean {
    if (this.activeSequence) {
      const { sequence, currentIndex, timer } = this.activeSequence;
      const expectedCombo = sequence.combos[currentIndex + 1];

      if (expectedCombo && this.combosMatch(pressedCombo, expectedCombo)) {
        clearTimeout(timer);

        if (currentIndex + 1 === sequence.combos.length - 1) {
          // Sequence complete
          sequence.handler();
          this.activeSequence = null;
          return true;
        } else {
          // Continue sequence
          this.activeSequence = {
            sequence,
            currentIndex: currentIndex + 1,
            timer: setTimeout(() => {
              this.activeSequence = null;
            }, sequence.timeout || 1000),
          };
          return true;
        }
      } else {
        // Sequence broken
        clearTimeout(timer);
        this.activeSequence = null;
      }
    }

    // Check if this starts a new sequence
    for (const sequence of this.sequences) {
      if (sequence.scope && !this.isScopeActive(sequence.scope)) continue;
      const firstCombo = sequence.combos[0];
      if (firstCombo && this.combosMatch(pressedCombo, firstCombo)) {
        if (sequence.combos.length === 1) {
          sequence.handler();
          return true;
        }
        this.activeSequence = {
          sequence,
          currentIndex: 0,
          timer: setTimeout(() => {
            this.activeSequence = null;
          }, sequence.timeout || 1000),
        };
        return true;
      }
    }

    return false;
  }

  // Find matching bindings for a key combo
  private findMatchingBindings(combo: ShortcutCombo): ShortcutBinding[] {
    const matches: ShortcutBinding[] = [];

    for (const [scopeId, scope] of this.scopes) {
      if (!scope.active && scopeId !== 'global') continue;
      for (const binding of scope.bindings) {
        if (this.combosMatch(combo, binding.combo)) {
          matches.push(binding);
        }
      }
    }

    // Sort: non-global before global (more specific first)
    matches.sort((a, b) => {
      if (a.scope === 'global' && b.scope !== 'global') return 1;
      if (a.scope !== 'global' && b.scope === 'global') return -1;
      return 0;
    });

    return matches;
  }

  // Check if two combos match
  private combosMatch(a: ShortcutCombo, b: ShortcutCombo): boolean {
    return (
      a.key === b.key &&
      a.ctrl === (b.ctrl || false) &&
      a.shift === (b.shift || false) &&
      a.alt === (b.alt || false) &&
      a.meta === (b.meta || false)
    );
  }

  // Generate unique key for combo
  private comboKey(combo: ShortcutCombo): string {
    return `${combo.ctrl ? 'C' : ''}${combo.shift ? 'S' : ''}${combo.alt ? 'A' : ''}${combo.meta ? 'M' : ''}${combo.key}`;
  }

  // Scope management
  activateScope(scopeId: string): void {
    const scope = this.scopes.get(scopeId);
    if (scope) scope.active = true;
  }

  deactivateScope(scopeId: string): void {
    const scope = this.scopes.get(scopeId);
    if (scope && scopeId !== 'global') scope.active = false;
  }

  private isScopeActive(scopeId: string): boolean {
    const scope = this.scopes.get(scopeId);
    return scope ? scope.active : false;
  }

  // Detect conflicts
  detectConflicts(): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    const comboMap: Map<string, ShortcutBinding[]> = new Map();

    for (const [scopeId, scope] of this.scopes) {
      for (const binding of scope.bindings) {
        const key = `${scopeId}:${this.comboKey(binding.combo)}`;
        if (!comboMap.has(key)) comboMap.set(key, []);
        comboMap.get(key)!.push(binding);
      }
    }

    comboMap.forEach((bindings, _key) => {
      if (bindings.length > 1) {
        for (let i = 0; i < bindings.length - 1; i++) {
          const b1 = bindings[i]!;
          const b2 = bindings[i + 1]!;
          conflicts.push({
            binding1: b1,
            binding2: b2,
            scope: b1.scope || 'global',
            combo: this.comboToString(b1.combo),
          });
        }
      }
    });

    return conflicts;
  }

  // Enable/disable shortcuts dynamically
  enable(): void {
    this.enabled = true;
  }
  disable(): void {
    this.enabled = false;
  }

  enableBinding(id: string): void {
    this.disabledBindings.delete(id);
  }
  disableBinding(id: string): void {
    this.disabledBindings.add(id);
  }

  // Generate help display data
  getHelpData(): Array<{
    scope: string;
    shortcuts: Array<{ combo: string; description: string }>;
  }> {
    const help: Array<{ scope: string; shortcuts: Array<{ combo: string; description: string }> }> =
      [];

    for (const [_scopeId, scope] of this.scopes) {
      const shortcuts = scope.bindings
        .filter((b) => b.description && b.enabled)
        .map((b) => ({
          combo: this.comboToString(b.combo),
          description: b.description || '',
        }));

      if (shortcuts.length > 0) {
        help.push({ scope: scope.label, shortcuts });
      }
    }

    return help;
  }

  // Get all registered bindings
  getBindings(): ShortcutBinding[] {
    return Array.from(this.globalBindings.values());
  }

  // Subscribe to shortcut executions
  onShortcut(listener: ShortcutListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.listeners.clear();
    this.scopes.clear();
    this.globalBindings.clear();
    this.sequences = [];
    if (this.activeSequence?.timer) {
      clearTimeout(this.activeSequence.timer);
    }
    this.activeSequence = null;
  }
}

export default KeyboardShortcutManager;
