import { describe, it, expect } from 'vitest';
import { IntentParser } from '../voice/intent-parser.js';
import { AliasRegistry } from '../voice/alias-registry.js';
import { ShortcutStore } from '../voice/shortcut-store.js';
import { CommandGrammar } from '../voice/command-grammar.js';

describe('IntentParser', () => {
  function setup() {
    const aliases = new AliasRegistry();
    const shortcuts = new ShortcutStore();
    const grammar = new CommandGrammar();
    const parser = new IntentParser(aliases, shortcuts, grammar);
    return { aliases, shortcuts, grammar, parser };
  }

  it('applies alias substitution before matching', () => {
    const { aliases, parser } = setup();
    aliases.add('mom', '+15551234567');
    const result = parser.parse('call mom');
    expect(result.type).toBe('grammar');
    expect(result.intent!.params.target).toBe('+15551234567');
  });

  it('shortcuts have priority over grammar', () => {
    const { shortcuts, parser } = setup();
    shortcuts.create({
      trigger: 'call john',
      actions: [{ capability: 'custom', action: 'x', params: {} }],
    });
    const result = parser.parse('call john');
    expect(result.type).toBe('shortcut');
    expect(result.shortcut!.trigger).toBe('call john');
  });

  it('falls back to grammar when no shortcut matches', () => {
    const { parser } = setup();
    const result = parser.parse('play jazz');
    expect(result.type).toBe('grammar');
    expect(result.intent!.capability).toBe('media');
  });

  it('returns unrecognized for unknown input', () => {
    const { parser } = setup();
    const result = parser.parse('xyzzy foobar');
    expect(result.type).toBe('unrecognized');
  });
});
