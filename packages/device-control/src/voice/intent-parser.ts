import type { ParseResult } from './types.js';
import type { AliasRegistry } from './alias-registry.js';
import type { ShortcutStore } from './shortcut-store.js';
import type { CommandGrammar } from './command-grammar.js';

export class IntentParser {
  constructor(
    private aliases: AliasRegistry,
    private shortcuts: ShortcutStore,
    private grammar: CommandGrammar,
  ) {}

  parse(rawText: string): ParseResult {
    const normalized = rawText.trim().toLowerCase();
    const resolved = this.aliases.resolve(normalized);

    const shortcut = this.shortcuts.get(resolved);
    if (shortcut && shortcut.enabled) {
      return { type: 'shortcut', shortcut };
    }

    const intent = this.grammar.match(resolved);
    if (intent) {
      return { type: 'grammar', intent };
    }

    return { type: 'unrecognized' };
  }
}
