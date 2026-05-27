import { describe, it, expect, beforeEach } from 'vitest';
import { AIMemoryStore } from '../memory-store';
import { MemoryExplainer } from '../memory-explainer';
import { MemoryExporter } from '../memory-export';
import type { MemoryEntry } from '../types';

describe('AIMemoryStore', () => {
  let store: AIMemoryStore;

  beforeEach(() => {
    store = new AIMemoryStore();
  });

  it('creates a memory entry with id and timestamps', () => {
    const entry = store.create({
      userId: 'user1',
      category: 'preference',
      content: 'Prefers dark mode',
      source: 'settings-page',
      sourceApp: 'quantchat',
      explanation: 'User changed theme to dark',
      expiresAt: undefined,
    });

    expect(entry.id).toMatch(/^mem_/);
    expect(entry.createdAt).toBeGreaterThan(0);
    expect(entry.updatedAt).toBeGreaterThan(0);
    expect(entry.accessLog).toHaveLength(0);
  });

  it('updates an existing memory entry', () => {
    const entry = store.create({
      userId: 'user1',
      category: 'fact',
      content: 'Works at Company A',
      source: 'profile',
      sourceApp: 'quantmail',
      explanation: 'From email signature',
    });

    const updated = store.update(entry.id, { content: 'Works at Company B' });
    expect(updated).toBeDefined();
    expect(updated!.content).toBe('Works at Company B');
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(entry.updatedAt);
  });

  it('deletes a memory entry', () => {
    const entry = store.create({
      userId: 'user1',
      category: 'context',
      content: 'Working on project X',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned in conversation',
    });

    const deleted = store.delete(entry.id);
    expect(deleted).toBe(true);
    expect(store.get(entry.id)).toBeUndefined();
  });

  it('searches memories by category', () => {
    store.create({
      userId: 'user1',
      category: 'preference',
      content: 'Likes TypeScript',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned preference',
    });
    store.create({
      userId: 'user1',
      category: 'fact',
      content: 'Lives in NYC',
      source: 'profile',
      sourceApp: 'quantmail',
      explanation: 'From profile',
    });

    const preferences = store.searchByCategory('user1', 'preference');
    expect(preferences).toHaveLength(1);
    expect(preferences[0]!.content).toBe('Likes TypeScript');
  });

  it('searches memories by content', () => {
    store.create({
      userId: 'user1',
      category: 'fact',
      content: 'Expert in machine learning',
      source: 'resume',
      sourceApp: 'quantdocs',
      explanation: 'From uploaded resume',
    });
    store.create({
      userId: 'user1',
      category: 'goal',
      content: 'Learn Rust programming',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned goal',
    });

    const results = store.searchByContent('user1', 'machine');
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('machine learning');
  });

  it('logs access to a memory entry', () => {
    const entry = store.create({
      userId: 'user1',
      category: 'preference',
      content: 'Prefers email over chat',
      source: 'survey',
      sourceApp: 'quantmail',
      explanation: 'From preference survey',
    });

    const logged = store.logAccess(entry.id, {
      accessedAt: Date.now(),
      reason: 'Personalization',
      requestingApp: 'quantchat',
    });

    expect(logged).toBe(true);
    const accessLog = store.getAccessLog(entry.id);
    expect(accessLog).toHaveLength(1);
    expect(accessLog[0]!.requestingApp).toBe('quantchat');
  });

  it('filters out expired memories', () => {
    store.create({
      userId: 'user1',
      category: 'context',
      content: 'Expired context',
      source: 'temp',
      sourceApp: 'quantchat',
      explanation: 'Temporary context',
      expiresAt: Date.now() - 10000,
    });
    store.create({
      userId: 'user1',
      category: 'fact',
      content: 'Valid fact',
      source: 'profile',
      sourceApp: 'quantmail',
      explanation: 'Permanent fact',
    });

    const memories = store.getUserMemories('user1');
    expect(memories).toHaveLength(1);
    expect(memories[0]!.content).toBe('Valid fact');
  });
});

describe('MemoryExplainer', () => {
  let explainer: MemoryExplainer;

  beforeEach(() => {
    explainer = new MemoryExplainer();
  });

  it('generates an explanation for a memory entry', () => {
    const entry: MemoryEntry = {
      id: 'mem_1',
      userId: 'user1',
      category: 'preference',
      content: 'Prefers dark mode',
      source: 'settings-page',
      sourceApp: 'quantchat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessLog: [],
      explanation: 'User toggled theme',
    };

    const explanation = explainer.explain(entry);
    expect(explanation).toContain('quantchat');
    expect(explanation).toContain('settings-page');
    expect(explanation).toContain('preference');
  });

  it('includes last access info in explanation', () => {
    const entry: MemoryEntry = {
      id: 'mem_1',
      userId: 'user1',
      category: 'fact',
      content: 'Works at Acme',
      source: 'email-sig',
      sourceApp: 'quantmail',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessLog: [{ accessedAt: Date.now(), reason: 'Greeting', requestingApp: 'quantchat' }],
      explanation: 'Extracted from email',
    };

    const explanation = explainer.explain(entry);
    expect(explanation).toContain('quantchat');
    expect(explanation).toContain('Greeting');
  });
});

describe('MemoryExporter', () => {
  let store: AIMemoryStore;
  let exporter: MemoryExporter;

  beforeEach(() => {
    store = new AIMemoryStore();
    exporter = new MemoryExporter(store);
  });

  it('exports memories to JSON format', () => {
    store.create({
      userId: 'user1',
      category: 'preference',
      content: 'Likes cats',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned liking cats',
    });

    const json = exporter.export('user1', 'json');
    const parsed = JSON.parse(json) as { version: string; entries: unknown[] };
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.entries).toHaveLength(1);
  });

  it('imports memories from JSON format', () => {
    const importData = JSON.stringify({
      version: '1.0.0',
      exportedAt: Date.now(),
      userId: 'user1',
      entries: [
        {
          id: 'mem_old_1',
          userId: 'user1',
          category: 'fact',
          content: 'Imported fact',
          source: 'import',
          sourceApp: 'quantdocs',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessLog: [],
          explanation: 'Imported from backup',
        },
      ],
    });

    const imported = exporter.importFromJson(importData);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.content).toBe('Imported fact');
    // Imported entry gets a new id
    expect(imported[0]!.id).toMatch(/^mem_/);
  });

  it('exports memories to markdown format', () => {
    store.create({
      userId: 'user1',
      category: 'goal',
      content: 'Learn piano',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'User expressed goal',
    });

    const markdown = exporter.export('user1', 'markdown');
    expect(markdown).toContain('# AI Memory Export');
    expect(markdown).toContain('Learn piano');
    expect(markdown).toContain('goal');
  });
});
