import { describe, it, expect } from 'vitest';
import { IntentParser } from '../planner/intent-parser.js';

describe('IntentParser', () => {
  const parser = new IntentParser();

  it('should parse a single intent: send an email to bob@test.com', () => {
    const intents = parser.parse('send an email to bob@test.com');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.action).toBe('send');
    expect(intents[0]!.entities['email']).toBe('bob@test.com');
    expect(intents[0]!.confidence).toBeGreaterThan(0);
  });

  it('should parse multi-intent: schedule a meeting tomorrow at 5pm and message the team on chat', () => {
    const intents = parser.parse('schedule a meeting tomorrow at 5pm and message the team on chat');
    expect(intents.length).toBeGreaterThanOrEqual(2);
    const scheduleIntent = intents.find((i) => i.action === 'schedule');
    const messageIntent = intents.find((i) => i.action === 'message');
    expect(scheduleIntent).toBeDefined();
    expect(messageIntent).toBeDefined();
  });

  it('should extract temporal expressions (tomorrow at 5pm)', () => {
    const intents = parser.parse('schedule a meeting tomorrow at 5pm');
    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    expect(intent.temporal).toBeDefined();
    expect(intent.temporal!.startTime).toBeDefined();
    const date = new Date(intent.temporal!.startTime!);
    expect(date.getHours()).toBe(17);
  });

  it('should extract email entity from input', () => {
    const intents = parser.parse('send a message to user@example.com about the project');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.entities['email']).toBe('user@example.com');
  });

  it('should extract @mention entity', () => {
    const intents = parser.parse('message @alice about the meeting');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.entities['mention']).toBe('alice');
  });

  it('should handle garbage input with low confidence', () => {
    const intents = parser.parse('xyzzy foobar baz 123 !!!');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.action).toBe('unknown');
    expect(intents[0]!.confidence).toBeLessThanOrEqual(0.3);
  });

  it('should map "upload a video" to targetApp quantube', () => {
    const intents = parser.parse('upload a video to my channel');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.targetApp).toBe('quantube');
  });

  it('should map "create a post" to targetApp quantneon', () => {
    const intents = parser.parse('create a post about the new feature');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.targetApp).toBe('quantneon');
  });

  it('should extract "the team" as a group entity', () => {
    const intents = parser.parse('message the team about the deadline');
    expect(intents).toHaveLength(1);
    expect(intents[0]!.entities['group']).toBe('team');
  });

  it('should extract temporal "next Monday" correctly', () => {
    const intents = parser.parse('schedule a review for next monday at 3pm');
    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    expect(intent.temporal).toBeDefined();
    expect(intent.temporal!.startTime).toBeDefined();
    const date = new Date(intent.temporal!.startTime!);
    expect(date.getDay()).toBe(1); // Monday
    expect(date.getHours()).toBe(15); // 3pm
  });
});
