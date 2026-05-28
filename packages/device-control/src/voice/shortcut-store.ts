import type { CustomShortcut } from './types.js';

export class ShortcutStore {
  private shortcuts = new Map<string, CustomShortcut>();

  create(
    shortcut: Omit<CustomShortcut, 'enabled' | 'stopOnFailure'> &
      Partial<Pick<CustomShortcut, 'enabled' | 'stopOnFailure'>>,
  ): CustomShortcut {
    const full: CustomShortcut = {
      ...shortcut,
      enabled: shortcut.enabled ?? true,
      stopOnFailure: shortcut.stopOnFailure ?? true,
    };
    this.shortcuts.set(full.trigger.toLowerCase(), full);
    return full;
  }

  get(trigger: string): CustomShortcut | undefined {
    return this.shortcuts.get(trigger.toLowerCase());
  }

  update(trigger: string, patch: Partial<CustomShortcut>): boolean {
    const existing = this.shortcuts.get(trigger.toLowerCase());
    if (!existing) return false;
    Object.assign(existing, patch);
    return true;
  }

  delete(trigger: string): boolean {
    return this.shortcuts.delete(trigger.toLowerCase());
  }

  list(): CustomShortcut[] {
    return [...this.shortcuts.values()];
  }

  has(trigger: string): boolean {
    return this.shortcuts.has(trigger.toLowerCase());
  }
}
