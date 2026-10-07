import { describe, it, expect } from 'vitest';
import { IMAPBridge } from '../mail-protocols/imap-bridge.js';
import type { IMAPConfig, BridgeMessage } from '../mail-protocols/imap-bridge.js';

describe('IMAPBridge', () => {
  const validConfig: IMAPConfig = {
    host: 'imap.example.com',
    port: 993,
    tls: true,
    username: 'user@example.com',
    password: 'secret',
  };

  function createConnectedBridge(): IMAPBridge {
    const bridge = new IMAPBridge();
    bridge.connect(validConfig);
    return bridge;
  }

  function sampleMessage(uid: number, subject: string): BridgeMessage {
    return {
      uid,
      flags: [],
      subject,
      from: 'sender@example.com',
      to: 'user@example.com',
      date: '2024-06-01T10:00:00Z',
      body: 'Message body',
      size: 100,
    };
  }

  it('connects with valid config', () => {
    const bridge = new IMAPBridge();
    const result = bridge.connect(validConfig);
    expect(result).toBe(true);
    expect(bridge.isConnected()).toBe(true);
  });

  it('rejects invalid config', () => {
    const bridge = new IMAPBridge();
    const result = bridge.connect({ host: '', port: -1 } as unknown as IMAPConfig);
    expect(result).toBe(false);
    expect(bridge.isConnected()).toBe(false);
  });

  it('lists default mailboxes after connect', () => {
    const bridge = createConnectedBridge();
    const mailboxes = bridge.listMailboxes();

    expect(mailboxes.length).toBeGreaterThanOrEqual(5);
    const names = mailboxes.map((m) => m.name);
    expect(names).toContain('INBOX');
    expect(names).toContain('Sent');
    expect(names).toContain('Trash');
  });

  it('returns empty when not connected', () => {
    const bridge = new IMAPBridge();
    expect(bridge.listMailboxes()).toEqual([]);
  });

  it('fetches messages by range', () => {
    const bridge = createConnectedBridge();
    bridge.addMessage('INBOX', sampleMessage(1, 'First'));
    bridge.addMessage('INBOX', sampleMessage(2, 'Second'));
    bridge.addMessage('INBOX', sampleMessage(3, 'Third'));

    const msgs = bridge.fetchMessages('INBOX', { start: 1, end: 2 });
    expect(msgs.length).toBe(2);
    expect(msgs[0]!.subject).toBe('First');
    expect(msgs[1]!.subject).toBe('Second');
  });

  it('returns empty for unknown mailbox', () => {
    const bridge = createConnectedBridge();
    const msgs = bridge.fetchMessages('NonExistent', { start: 1, end: 10 });
    expect(msgs).toEqual([]);
  });

  it('searches messages by criteria', () => {
    const bridge = createConnectedBridge();
    bridge.addMessage('INBOX', {
      uid: 1,
      flags: [],
      subject: 'Important Update',
      from: 'boss@company.com',
      to: 'user@example.com',
      date: '2024-06-01T10:00:00Z',
      size: 200,
    });
    bridge.addMessage('INBOX', {
      uid: 2,
      flags: ['\\Seen'],
      subject: 'Newsletter',
      from: 'news@example.com',
      to: 'user@example.com',
      date: '2024-06-02T10:00:00Z',
      size: 500,
    });

    const unseen = bridge.search({ unseen: true });
    expect(unseen).toEqual([1]);

    const fromBoss = bridge.search({ from: 'boss' });
    expect(fromBoss).toEqual([1]);

    const bySubject = bridge.search({ subject: 'newsletter' });
    expect(bySubject).toEqual([2]);
  });

  it('returns empty search results when not connected', () => {
    const bridge = new IMAPBridge();
    expect(bridge.search({ unseen: true })).toEqual([]);
  });

  it('moves messages between mailboxes', () => {
    const bridge = createConnectedBridge();
    bridge.addMessage('INBOX', sampleMessage(1, 'Move Me'));

    const moved = bridge.moveMessage(1, 'Trash');
    expect(moved).toBe(true);

    const inbox = bridge.fetchMessages('INBOX', { start: 1, end: 10 });
    expect(inbox.length).toBe(0);

    const trash = bridge.fetchMessages('Trash', { start: 1, end: 10 });
    expect(trash.length).toBe(1);
    expect(trash[0]!.subject).toBe('Move Me');
  });

  it('fails to move to non-existent mailbox', () => {
    const bridge = createConnectedBridge();
    bridge.addMessage('INBOX', sampleMessage(1, 'Stay Here'));

    expect(bridge.moveMessage(1, 'NonExistent')).toBe(false);
  });

  it('sets flags on a message', () => {
    const bridge = createConnectedBridge();
    bridge.addMessage('INBOX', sampleMessage(1, 'Flag Me'));

    expect(bridge.setFlags(1, ['\\Seen', '\\Flagged'])).toBe(true);

    const msgs = bridge.fetchMessages('INBOX', { start: 1, end: 1 });
    expect(msgs[0]!.flags).toContain('\\Seen');
    expect(msgs[0]!.flags).toContain('\\Flagged');
  });

  it('idle registers a callback', () => {
    const bridge = createConnectedBridge();
    const events: unknown[] = [];

    const registered = bridge.idle('INBOX', (event) => {
      events.push(event);
    });
    expect(registered).toBe(true);

    // Adding a message triggers the idle callback
    bridge.addMessage('INBOX', sampleMessage(1, 'New Message'));
    expect(events.length).toBe(1);
  });

  it('idle returns false for non-existent mailbox', () => {
    const bridge = createConnectedBridge();
    expect(bridge.idle('Fake', () => {})).toBe(false);
  });

  it('disconnects properly', () => {
    const bridge = createConnectedBridge();
    bridge.disconnect();
    expect(bridge.isConnected()).toBe(false);
    expect(bridge.listMailboxes()).toEqual([]);
  });
});
