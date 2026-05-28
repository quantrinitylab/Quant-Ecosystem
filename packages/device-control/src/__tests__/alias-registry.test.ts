import { describe, it, expect } from 'vitest';
import { AliasRegistry } from '../voice/alias-registry.js';

describe('AliasRegistry', () => {
  it('adds and resolves an alias', () => {
    const reg = new AliasRegistry();
    reg.add('mom', '+15551234567');
    expect(reg.resolve('call mom')).toBe('call +15551234567');
  });

  it('resolves multiple aliases in one string', () => {
    const reg = new AliasRegistry();
    reg.add('home', '123 main st');
    reg.add('work', '456 office rd');
    expect(reg.resolve('from home to work')).toBe('from 123 main st to 456 office rd');
  });

  it('resolves case-insensitively', () => {
    const reg = new AliasRegistry();
    reg.add('Dad', '+15559999999');
    expect(reg.resolve('call dad')).toBe('call +15559999999');
  });

  it('removes an alias', () => {
    const reg = new AliasRegistry();
    reg.add('x', 'y');
    expect(reg.remove('x')).toBe(true);
    expect(reg.resolve('x')).toBe('x');
  });

  it('clears all aliases', () => {
    const reg = new AliasRegistry();
    reg.add('a', 'b');
    reg.add('c', 'd');
    reg.clear();
    expect(reg.getAll()).toHaveLength(0);
  });
});
