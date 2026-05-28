import { describe, it, expect } from 'vitest';
import { CommandGrammar } from '../voice/command-grammar.js';

describe('CommandGrammar', () => {
  const grammar = new CommandGrammar();

  it('matches "call john" to phone/place', () => {
    const r = grammar.match('call john');
    expect(r).toEqual({ capability: 'phone', action: 'place', params: { target: 'john' } });
  });

  it('matches "text alice hello there" to sms/send', () => {
    const r = grammar.match('text alice hello there');
    expect(r).toEqual({
      capability: 'sms',
      action: 'send',
      params: { target: 'alice', message: 'hello there' },
    });
  });

  it('matches "set alarm 7am" to alarm/set', () => {
    const r = grammar.match('set alarm 7am');
    expect(r).toEqual({ capability: 'alarm', action: 'set', params: { time: '7am' } });
  });

  it('matches "take me to the store" to location/navigate', () => {
    const r = grammar.match('take me to the store');
    expect(r).toEqual({
      capability: 'location',
      action: 'navigate',
      params: { destination: 'the store' },
    });
  });

  it('matches "turn on lights" to iot/toggle', () => {
    const r = grammar.match('turn on lights');
    expect(r).toEqual({
      capability: 'iot',
      action: 'toggle',
      params: { device: 'lights', state: 'on' },
    });
  });

  it('matches Hindi "call kar papa" to phone/place', () => {
    const r = grammar.match('call kar papa');
    expect(r).toEqual({ capability: 'phone', action: 'place', params: { target: 'papa' } });
  });

  it('matches Hindi "ghar le chal" to location/navigate home', () => {
    const r = grammar.match('ghar le chal');
    expect(r).toEqual({
      capability: 'location',
      action: 'navigate',
      params: { destination: 'home' },
    });
  });

  it('returns null for unrecognized input', () => {
    expect(grammar.match('asdfghjkl')).toBeNull();
  });
});
