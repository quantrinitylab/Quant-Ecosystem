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
      category: 'preferences',
      content: 'Prefers dark mode',
      source: 'settings-page',
      sourceApp: 'quantchat',
      explanation: 'User changed theme to dark',
      expiresAt: undefined,
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });

    expect(entry.id).toMatch(/^mem_/);
    expect(entry.createdAt).toBeGreaterThan(0);
    expect(entry.updatedAt).toBeGreaterThan(0);
    expect(entry.accessLog).toHaveLength(0);
  });

  it('updates an existing memory entry', () => {
    const entry = store.create({
      userId: 'user1',
      category: 'people',
      content: 'Works at Company A',
      source: 'profile',
      sourceApp: 'quantmail',
      explanation: 'From email signature',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });

    const updated = store.update(entry.id, { content: 'Works at Company B' });
    expect(updated).toBeDefined();
    expect(updated!.content).toBe('Works at Company B');
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(entry.updatedAt);
  });

  it('deletes a memory entry', () => {
    const entry = store.create({
      userId: 'user1',
      category: 'projects',
      content: 'Working on project X',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned in conversation',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });

    const deleted = store.delete(entry.id);
    expect(deleted).toBe(true);
    expect(store.get(entry.id)).toBeUndefined();
  });

  it('searches memories by category', () => {
    store.create({
      userId: 'user1',
      category: 'preferences',
      content: 'Likes TypeScript',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned preference',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });
    store.create({
      userId: 'user1',
      category: 'people',
      content: 'Lives in NYC',
      source: 'profile',
      sourceApp: 'quantmail',
      explanation: 'From profile',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });

    const preferences = store.searchByCategory('user1', 'preferences');
    expect(preferences).toHaveLength(1);
    expect(preferences[0]!.content).toBe('Likes TypeScript');
  });

  it('searches memories by content', () => {
    store.create({
      userId: 'user1',
      category: 'skills',
      content: 'Expert in machine learning',
      source: 'resume',
      sourceApp: 'quantdocs',
      explanation: 'From uploaded resume',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });
    store.create({
      userId: 'user1',
      category: 'goals',
      content: 'Learn Rust programming',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned goal',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });

    const results = store.searchByContent('user1', 'machine');
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('machine learning');
  });

  it('logs access to a memory entry', () => {
    const entry = store.create({
      userId: 'user1',
      category: 'preferences',
      content: 'Prefers email over chat',
      source: 'survey',
      sourceApp: 'quantmail',
      explanation: 'From preference survey',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
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
      category: 'projects',
      content: 'Expired context',
      source: 'temp',
      sourceApp: 'quantchat',
      explanation: 'Temporary context',
      expiresAt: Date.now() - 10000,
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });
    store.create({
      userId: 'user1',
      category: 'people',
      content: 'Valid fact',
      source: 'profile',
      sourceApp: 'quantmail',
      explanation: 'Permanent fact',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });

    const memories = store.getUserMemories('user1');
    expect(memories).toHaveLength(1);
    expect(memories[0]!.content).toBe('Valid fact');
  });

  describe('anti-creep enforcement', () => {
    it('throws if create() is called without writeSignal=explicit', () => {
      expect(() =>
        store.create({
          userId: 'user1',
          category: 'preferences',
          content: 'Sneaky memory',
          source: 'auto',
          sourceApp: 'quantchat',
          explanation: 'Auto-detected',
          accessScopes: ['*'],
          writeSignal: 'digest-approved',
          status: 'active',
          tags: [],
        }),
      ).toThrow('writeSignal must be "explicit"');
    });
  });

  describe('candidate system', () => {
    it('createCandidate creates a pending entry', () => {
      const candidate = store.createCandidate({
        userId: 'user1',
        category: 'preferences',
        content: 'Detected preference for morning meetings',
        source: 'pattern-detection',
        sourceApp: 'quantai',
        explanation: 'Observed from calendar patterns',
        accessScopes: ['quantai'],
        tags: ['meetings'],
      });

      expect(candidate.status).toBe('pending');
      expect(candidate.id).toMatch(/^mem_/);
    });

    it('pending candidates are not returned by getUserMemories', () => {
      store.createCandidate({
        userId: 'user1',
        category: 'routines',
        content: 'Checks email at 9am',
        source: 'pattern-detection',
        sourceApp: 'quantmail',
        explanation: 'Observed pattern',
        accessScopes: ['*'],
        tags: ['email'],
      });

      const memories = store.getUserMemories('user1');
      expect(memories).toHaveLength(0);
    });

    it('getPendingCandidates returns pending entries', () => {
      store.createCandidate({
        userId: 'user1',
        category: 'routines',
        content: 'Checks email at 9am',
        source: 'pattern-detection',
        sourceApp: 'quantmail',
        explanation: 'Observed pattern',
        accessScopes: ['*'],
        tags: ['email'],
      });

      const pending = store.getPendingCandidates('user1');
      expect(pending).toHaveLength(1);
      expect(pending[0]!.content).toBe('Checks email at 9am');
    });

    it('approveCandidate transitions to active with digest-approved signal', () => {
      const candidate = store.createCandidate({
        userId: 'user1',
        category: 'schedules',
        content: 'Weekly team standup on Mondays',
        source: 'pattern-detection',
        sourceApp: 'quantai',
        explanation: 'Detected from calendar',
        accessScopes: ['*'],
        tags: ['standup'],
      });

      const approved = store.approveCandidate(candidate.id);
      expect(approved).toBeDefined();
      expect(approved!.status).toBe('active');
      expect(approved!.writeSignal).toBe('digest-approved');

      const memories = store.getUserMemories('user1');
      expect(memories).toHaveLength(1);
    });

    it('rejectCandidate removes the pending entry', () => {
      const candidate = store.createCandidate({
        userId: 'user1',
        category: 'preferences',
        content: 'Might like jazz',
        source: 'pattern-detection',
        sourceApp: 'quantmusic',
        explanation: 'Listened to jazz playlist',
        accessScopes: ['*'],
        tags: ['music'],
      });

      const rejected = store.rejectCandidate(candidate.id);
      expect(rejected).toBe(true);
      expect(store.get(candidate.id)).toBeUndefined();
      expect(store.getPendingCandidates('user1')).toHaveLength(0);
    });
  });

  describe('purgeByTag', () => {
    it('deletes all memories matching a tag for a user', () => {
      store.create({
        userId: 'user1',
        category: 'people',
        content: 'Met John at conference',
        source: 'chat',
        sourceApp: 'quantchat',
        explanation: 'From conversation',
        accessScopes: ['*'],
        writeSignal: 'explicit',
        status: 'active',
        tags: ['conference', 'networking'],
      });
      store.create({
        userId: 'user1',
        category: 'places',
        content: 'Conference was in SF',
        source: 'chat',
        sourceApp: 'quantchat',
        explanation: 'Location mentioned',
        accessScopes: ['*'],
        writeSignal: 'explicit',
        status: 'active',
        tags: ['conference', 'travel'],
      });
      store.create({
        userId: 'user1',
        category: 'goals',
        content: 'Learn GraphQL',
        source: 'chat',
        sourceApp: 'quantchat',
        explanation: 'Mentioned goal',
        accessScopes: ['*'],
        writeSignal: 'explicit',
        status: 'active',
        tags: ['learning'],
      });

      const purged = store.purgeByTag('user1', 'conference');
      expect(purged).toBe(2);

      const remaining = store.getUserMemories('user1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.content).toBe('Learn GraphQL');
    });
  });

  describe('accessScopes', () => {
    it('stores accessScopes on memory entry', () => {
      const entry = store.create({
        userId: 'user1',
        category: 'preferences',
        content: 'Private preference',
        source: 'settings',
        sourceApp: 'quantchat',
        explanation: 'User set in settings',
        accessScopes: ['quantchat', 'quantmail'],
        writeSignal: 'explicit',
        status: 'active',
        tags: [],
      });

      expect(entry.accessScopes).toEqual(['quantchat', 'quantmail']);
    });
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
      category: 'preferences',
      content: 'Prefers dark mode',
      source: 'settings-page',
      sourceApp: 'quantchat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessLog: [],
      explanation: 'User toggled theme',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    };

    const explanation = explainer.explain(entry);
    expect(explanation).toContain('quantchat');
    expect(explanation).toContain('settings-page');
    expect(explanation).toContain('preferences');
  });

  it('includes last access info in explanation', () => {
    const entry: MemoryEntry = {
      id: 'mem_1',
      userId: 'user1',
      category: 'people',
      content: 'Works at Acme',
      source: 'email-sig',
      sourceApp: 'quantmail',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessLog: [{ accessedAt: Date.now(), reason: 'Greeting', requestingApp: 'quantchat' }],
      explanation: 'Extracted from email',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
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
      category: 'preferences',
      content: 'Likes cats',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'Mentioned liking cats',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
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
          category: 'people',
          content: 'Imported fact',
          source: 'import',
          sourceApp: 'quantdocs',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessLog: [],
          explanation: 'Imported from backup',
          accessScopes: ['*'],
          writeSignal: 'explicit',
          status: 'active',
          tags: [],
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
      category: 'goals',
      content: 'Learn piano',
      source: 'chat',
      sourceApp: 'quantchat',
      explanation: 'User expressed goal',
      accessScopes: ['*'],
      writeSignal: 'explicit',
      status: 'active',
      tags: [],
    });

    const markdown = exporter.export('user1', 'markdown');
    expect(markdown).toContain('# AI Memory Export');
    expect(markdown).toContain('Learn piano');
    expect(markdown).toContain('goals');
  });

  it('encrypted export/import roundtrip works', async () => {
    store.create({
      userId: 'user1',
      category: 'preferences',
      content: 'Secret preference',
      source: 'settings',
      sourceApp: 'quantchat',
      explanation: 'Private data',
      accessScopes: ['quantchat'],
      writeSignal: 'explicit',
      status: 'active',
      tags: ['private'],
    });

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);

    const encrypted = await exporter.exportEncrypted('user1', key);
    expect(encrypted.byteLength).toBeGreaterThan(0);

    // Create a new store/exporter for import
    const store2 = new AIMemoryStore();
    const exporter2 = new MemoryExporter(store2);
    const imported = await exporter2.importEncrypted(encrypted, key);

    expect(imported).toHaveLength(1);
    expect(imported[0]!.content).toBe('Secret preference');
    expect(imported[0]!.tags).toEqual(['private']);
  });
});
