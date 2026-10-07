import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceIntentParser } from '../voice/voice-intent-parser.js';

describe('VoiceIntentParser', () => {
  let parser: VoiceIntentParser;

  beforeEach(() => {
    parser = new VoiceIntentParser();
  });

  it('parses "scroll reels in quant neon" → app: quantneon, action: scroll', () => {
    const intent = parser.parse('scroll reels in quant neon');
    expect(intent.app).toBe('quantneon');
    expect(intent.action).toBe('scroll');
    expect(intent.params).toHaveProperty('type', 'reels');
    expect(intent.confidence).toBeGreaterThan(0.8);
  });

  it('parses "open DMs in quant sync" → app: quantsync, action: navigate', () => {
    const intent = parser.parse('open DMs in quant sync');
    expect(intent.app).toBe('quantsync');
    expect(intent.action).toBe('navigate');
    expect(intent.params).toHaveProperty('screen', 'messages');
    expect(intent.confidence).toBeGreaterThan(0.8);
  });

  it('parses "play next video" → action: media.next', () => {
    const intent = parser.parse('play next video');
    expect(intent.action).toBe('media.next');
    expect(intent.params).toHaveProperty('direction', 'next');
    expect(intent.confidence).toBeGreaterThan(0.8);
  });

  it('parses "summarize next email" → app: quantmail, action: ai.summarize', () => {
    const intent = parser.parse('summarize next email');
    expect(intent.app).toBe('quantmail');
    expect(intent.action).toBe('ai.summarize');
    expect(intent.confidence).toBeGreaterThan(0.8);
  });

  it('parses "search gaming videos in quant tube" → app: quantube, action: search.query', () => {
    const intent = parser.parse('search gaming videos in quant tube');
    expect(intent.app).toBe('quantube');
    expect(intent.action).toBe('search.query');
    expect(intent.params).toHaveProperty('query');
    expect(intent.confidence).toBeGreaterThan(0.8);
  });

  it('parses "pause video" → action: media.pause', () => {
    const intent = parser.parse('pause video');
    expect(intent.action).toBe('media.play');
    expect(intent.params).toHaveProperty('state', 'pause');
  });

  it('parses "like this post" → action: social.like', () => {
    const intent = parser.parse('like this post');
    expect(intent.action).toBe('social.like');
    expect(intent.params).toHaveProperty('action', 'like');
  });

  it('returns wildcard app and low confidence for unrecognized commands', () => {
    const intent = parser.parse('do something weird please');
    expect(intent.app).toBe('*');
    expect(intent.action).toBe('unknown');
    expect(intent.confidence).toBe(0.3);
  });
});
