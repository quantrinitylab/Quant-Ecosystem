import { describe, it, expect } from 'vitest';
import { IMAPAdapter } from '../imap-adapter.js';

describe('IMAPAdapter', () => {
  function createAuthenticatedAdapter(): IMAPAdapter {
    const adapter = new IMAPAdapter();
    adapter.authenticate('user@test.com', 'password');
    return adapter;
  }

  it('authenticates a user', () => {
    const adapter = new IMAPAdapter();
    const result = adapter.authenticate('user@test.com', 'password');
    expect(result.status).toBe('OK');
  });

  it('selects a mailbox', () => {
    const adapter = createAuthenticatedAdapter();
    const result = adapter.select('INBOX');

    expect(result.status).toBe('OK');
    expect(result.data).toBeDefined();
  });

  it('fails to select without authentication', () => {
    const adapter = new IMAPAdapter();
    const result = adapter.select('INBOX');
    expect(result.status).toBe('NO');
  });

  it('appends and fetches messages', () => {
    const adapter = createAuthenticatedAdapter();
    adapter.appendMessage('INBOX', {
      flags: [],
      subject: 'Test Email',
      from: 'sender@test.com',
      to: 'recipient@test.com',
      date: '2024-01-01',
      body: 'Hello, world!',
      size: 13,
    });

    adapter.select('INBOX');
    const result = adapter.fetch('1', ['UID', 'SUBJECT', 'FROM']);

    expect(result.status).toBe('OK');
    const data = result.data as Array<{ uid: number; subject: string; from: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.subject).toBe('Test Email');
  });

  it('searches messages by criteria', () => {
    const adapter = createAuthenticatedAdapter();
    adapter.appendMessage('INBOX', {
      flags: [],
      subject: 'Important',
      from: 'boss@company.com',
      to: 'me@test.com',
      date: '2024-01-15',
      body: 'Urgent',
      size: 6,
    });
    adapter.appendMessage('INBOX', {
      flags: ['\\Seen'],
      subject: 'Newsletter',
      from: 'news@example.com',
      to: 'me@test.com',
      date: '2024-01-16',
      body: 'Weekly digest',
      size: 13,
    });

    adapter.select('INBOX');
    const result = adapter.search({ unseen: true });

    expect(result.status).toBe('OK');
    expect(result.data).toEqual([1]);
  });

  it('stores flags on messages', () => {
    const adapter = createAuthenticatedAdapter();
    adapter.appendMessage('INBOX', {
      flags: [],
      subject: 'Flag Me',
      from: 'test@test.com',
      to: 'me@test.com',
      date: '2024-01-01',
      body: 'Content',
      size: 7,
    });

    adapter.select('INBOX');
    adapter.store('1', ['\\Seen', '\\Flagged'], '+FLAGS');

    const fetch = adapter.fetch('1', ['FLAGS']);
    const data = fetch.data as Array<{ flags: string[] }>;
    expect(data[0]!.flags).toContain('\\Seen');
    expect(data[0]!.flags).toContain('\\Flagged');
  });

  it('copies messages between mailboxes', () => {
    const adapter = createAuthenticatedAdapter();
    adapter.appendMessage('INBOX', {
      flags: [],
      subject: 'Copy Me',
      from: 'test@test.com',
      to: 'me@test.com',
      date: '2024-01-01',
      body: 'Copy content',
      size: 12,
    });

    adapter.select('INBOX');
    const result = adapter.copy('1', 'Sent');

    expect(result.status).toBe('OK');
    adapter.select('Sent');
    const fetched = adapter.fetch('1', ['SUBJECT']);
    const data = fetched.data as Array<{ subject: string }>;
    expect(data[0]!.subject).toBe('Copy Me');
  });

  it('lists default mailboxes', () => {
    const adapter = new IMAPAdapter();
    const mailboxes = adapter.getMailboxes();
    const names = mailboxes.map((m) => m.name);

    expect(names).toContain('INBOX');
    expect(names).toContain('Sent');
    expect(names).toContain('Drafts');
    expect(names).toContain('Trash');
  });

  it('rejects authentication when delegate returns false', () => {
    const adapter = new IMAPAdapter((username, password) => {
      return username === 'valid@test.com' && password === 'correct';
    });

    const failResult = adapter.authenticate('user@test.com', 'wrong');
    expect(failResult.status).toBe('NO');

    const okResult = adapter.authenticate('valid@test.com', 'correct');
    expect(okResult.status).toBe('OK');
  });

  it('accepts all credentials when no auth delegate is provided', () => {
    const adapter = new IMAPAdapter();
    const result = adapter.authenticate('anyone@test.com', 'anything');
    expect(result.status).toBe('OK');
  });
});
