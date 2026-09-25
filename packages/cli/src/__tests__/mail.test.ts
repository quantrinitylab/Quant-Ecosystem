import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerMailCommands } from '../commands/mail.js';
import { QuantCliClient } from '../client.js';
import { stripAnsi } from '../git-utils.js';

describe('quant mail commands', () => {
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // quant mail inbox
  // ─────────────────────────────────────────────────────────────────────────────
  describe('quant mail inbox', () => {
    it('lists emails with ID, Star, From, Subject, Category, and Date columns', async () => {
      const mockEmails = [
        {
          id: 'mail-001',
          fromAddress: 'alice@quantmail.in',
          fromName: 'Alice Dev',
          subject: 'Weekly Architecture Review',
          isStarred: true,
          isRead: false,
          aiCategory: 'primary',
          receivedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        },
        {
          id: 'mail-002',
          fromAddress: 'github@quantmail.in',
          fromName: 'CodeHub Bot',
          subject: '[PR #247] Merged Sovereign Git Engine',
          isStarred: false,
          isRead: true,
          aiCategory: 'updates',
          receivedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        },
        {
          id: 'mail-003',
          fromAddress: 'newsletter@clouddeals.io',
          fromName: 'Cloud Deals',
          subject: 'Special 50% discount on dedicated clusters',
          isStarred: false,
          isRead: false,
          aiCategory: 'promotions',
          receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        },
      ];

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: mockEmails,
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'inbox']);

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
      expect(output).toContain('QuantMail Inbox');
      expect(output).toContain('ID');
      expect(output).toContain('Star');
      expect(output).toContain('From');
      expect(output).toContain('Subject');
      expect(output).toContain('Category');
      expect(output).toContain('Date');
      expect(output).toContain('mail-001');
      expect(output).toContain('Alice Dev');
      expect(output).toContain('Weekly Architecture');
      expect(output).toContain('Primary');
      expect(output).toContain('Updates');
      expect(output).toContain('Promos');
      expect(output).toContain('★');
    });

    it('outputs pure JSON with --json flag', async () => {
      const mockEmails = [
        {
          id: 'mail-100',
          fromAddress: 'test@quantmail.in',
          subject: 'JSON Mode Test',
          isRead: true,
          aiCategory: 'primary',
        },
      ];

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: mockEmails,
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'inbox', '--json']);

      expect(logSpy).toHaveBeenCalled();
      const rawLog = logSpy.mock.calls[0][0];
      const parsed = JSON.parse(rawLog);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('mail-100');
      expect(parsed[0].subject).toBe('JSON Mode Test');
    });

    it('filters unread messages with --unread flag', async () => {
      const mockEmails = [
        { id: 'm1', isRead: false, subject: 'Unread Message', aiCategory: 'primary' },
        { id: 'm2', isRead: true, subject: 'Read Message', aiCategory: 'updates' },
      ];

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: mockEmails,
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'inbox', '--unread', '--json']);

      expect(logSpy).toHaveBeenCalled();
      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('m1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // quant mail read <id>
  // ─────────────────────────────────────────────────────────────────────────────
  describe('quant mail read <id>', () => {
    it('fetches and displays formatted email headers and body', async () => {
      const mockEmail = {
        id: 'msg-999',
        fromAddress: 'sender@example.com',
        fromName: 'Dr. Jane Smith',
        toAddresses: ['krish@quantmail.in'],
        ccAddresses: ['team@quantmail.in'],
        subject: 'Project Horizon: Next Sprint Deliverables',
        bodyPlain: 'Hello Krish,\n\nThe cluster deployment is running smoothly.\n\nBest,\nJane',
        isStarred: true,
        isRead: false,
        aiCategory: 'primary',
        receivedAt: '2026-09-25T12:00:00.000Z',
      };

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: mockEmail,
      });

      const postSpy = vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValue({
        success: true,
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'read', 'msg-999']);

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
      expect(output).toContain('From:');
      expect(output).toContain('Dr. Jane Smith <sender@example.com>');
      expect(output).toContain('To:');
      expect(output).toContain('krish@quantmail.in');
      expect(output).toContain('Cc:');
      expect(output).toContain('team@quantmail.in');
      expect(output).toContain('Subject:');
      expect(output).toContain('Project Horizon: Next Sprint Deliverables');
      expect(output).toContain('Hello Krish');
      expect(output).toContain('cluster deployment is running smoothly');
      expect(output).toContain('★ Starred');

      // Auto-marks as read
      expect(postSpy).toHaveBeenCalledWith('/api/emails/msg-999/read', {});
    });

    it('converts HTML email body to clean plaintext when bodyPlain is missing', async () => {
      const mockEmail = {
        id: 'html-001',
        fromAddress: 'newsletter@news.com',
        subject: 'HTML Formatting Test',
        bodyHtml:
          '<div><h1>Header Title</h1><p>First paragraph with <b>bold</b> text.</p><ul><li>Bullet 1</li><li>Bullet 2</li></ul></div>',
        isRead: true,
        aiCategory: 'updates',
      };

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: mockEmail,
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'read', 'html-001', '--no-mark-read']);

      const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
      expect(output).toContain('Header Title');
      expect(output).toContain('First paragraph with bold text.');
      expect(output).toContain('Bullet 1');
      expect(output).toContain('Bullet 2');
    });

    it('returns JSON format with --json flag', async () => {
      const mockEmail = {
        id: 'json-msg-1',
        fromAddress: 'api@quantmail.in',
        subject: 'API Payload Test',
        bodyPlain: 'JSON Body Content',
      };

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: mockEmail,
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'read', 'json-msg-1', '--json']);

      expect(logSpy).toHaveBeenCalled();
      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed.id).toBe('json-msg-1');
      expect(parsed.subject).toBe('API Payload Test');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // quant mail send
  // ─────────────────────────────────────────────────────────────────────────────
  describe('quant mail send', () => {
    it('calls POST /api/mail/send with --to, --subject, --body options', async () => {
      const postSpy = vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValueOnce({
        success: true,
        data: {
          id: 'sent-msg-1234',
          deliveryStatus: 'queued',
        },
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync([
        'node',
        'quant',
        'mail',
        'send',
        '--to',
        'colleague@quantmail.in',
        '--subject',
        'Quick update on PR review',
        '--body',
        'LGTM, merging to main branch now.',
      ]);

      expect(postSpy).toHaveBeenCalledWith(
        '/api/mail/send',
        expect.objectContaining({
          to: 'colleague@quantmail.in',
          toAddresses: ['colleague@quantmail.in'],
          subject: 'Quick update on PR review',
          body: 'LGTM, merging to main branch now.',
          send: true,
        }),
      );

      const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
      expect(output).toContain('Outbound message delivered');
      expect(output).toContain('colleague@quantmail.in');
      expect(output).toContain('Quick update on PR review');
      expect(output).toContain('sent-msg-1234');
    });

    it('falls back to /api/emails/compose if /api/mail/send returns 404', async () => {
      const notFoundErr = new Error('Not found') as any;
      notFoundErr.status = 404;

      const postSpy = vi
        .spyOn(QuantCliClient.prototype, 'post')
        .mockRejectedValueOnce(notFoundErr)
        .mockResolvedValueOnce({
          success: true,
          data: { id: 'fallback-sent-777' },
        });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync([
        'node',
        'quant',
        'mail',
        'send',
        '-t',
        'dev@quantmail.in',
        '-s',
        'Fallback Test',
        '-b',
        'Testing route fallback',
      ]);

      expect(postSpy).toHaveBeenNthCalledWith(
        1,
        '/api/mail/send',
        expect.objectContaining({ subject: 'Fallback Test' }),
      );
      expect(postSpy).toHaveBeenNthCalledWith(
        2,
        '/api/emails/compose',
        expect.objectContaining({ subject: 'Fallback Test' }),
      );

      const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
      expect(output).toContain('Outbound message delivered');
      expect(output).toContain('fallback-sent-777');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // quant mail search <query>
  // ─────────────────────────────────────────────────────────────────────────────
  describe('quant mail search <query>', () => {
    it('executes fast search across messages with highlighted query matches', async () => {
      const mockResults = [
        {
          id: 'search-01',
          fromAddress: 'billing@quantmail.in',
          fromName: 'Quant Billing',
          subject: 'Invoice for Q3 Dedicated Compute',
          bodyPlain: 'Your Invoice #88492 is ready for review.',
          receivedAt: '2026-09-25T10:00:00.000Z',
        },
      ];

      const getSpy = vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: mockResults,
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'search', 'Invoice']);

      expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('/api/emails/search?q=Invoice'));

      const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
      expect(output).toContain('Search Results for');
      expect(output).toContain('Invoice');
      expect(output).toContain('search-01');
      expect(output).toContain('Quant Billing');
    });

    it('returns search results as JSON with --json', async () => {
      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        success: true,
        data: [{ id: 'res-1', subject: 'Matches query' }],
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'search', 'test', '--json']);

      const parsed = JSON.parse(logSpy.mock.calls[0][0]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('res-1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // quant mail archive <id> & unarchive <id>
  // ─────────────────────────────────────────────────────────────────────────────
  describe('quant mail archive <id> and unarchive <id>', () => {
    it('archives email and displays instant undo hint', async () => {
      const postSpy = vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValueOnce({
        success: true,
        data: { message: 'Email archived' },
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'archive', 'msg-to-archive-10']);

      expect(postSpy).toHaveBeenCalledWith('/api/emails/msg-to-archive-10/archive', {});

      const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
      expect(output).toContain('Email msg-to-archive-10 archived');
      expect(output).toContain('quant mail unarchive msg-to-archive-10');
    });

    it('unarchives email to restore to inbox', async () => {
      const postSpy = vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValueOnce({
        success: true,
        data: { message: 'Email moved to inbox' },
      });

      const program = new Command();
      registerMailCommands(program);

      await program.parseAsync(['node', 'quant', 'mail', 'unarchive', 'msg-to-archive-10']);

      expect(postSpy).toHaveBeenCalledWith('/api/emails/msg-to-archive-10/unarchive', {});

      const output = stripAnsi(logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n'));
      expect(output).toContain('Email msg-to-archive-10 restored to inbox');
    });
  });
});
