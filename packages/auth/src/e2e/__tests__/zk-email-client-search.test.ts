import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { ClientSearchIndex } from '../zk-email/client-search';
import type { IndexableEmail } from '../zk-email/client-search';

describe('ClientSearchIndex', () => {
  const searchIndex = new ClientSearchIndex();
  const encryptionKey = crypto.randomBytes(32);

  const testEmails: IndexableEmail[] = [
    {
      id: 'email-1',
      subject: 'Project Update',
      sender: 'alice@example.com',
      body: 'The project deadline has been moved to next Friday.',
      timestamp: Date.now(),
    },
    {
      id: 'email-2',
      subject: 'Meeting Notes',
      sender: 'bob@example.com',
      body: 'Discussed budget allocation and team hiring.',
      timestamp: Date.now(),
    },
    {
      id: 'email-3',
      subject: 'Invoice #1234',
      sender: 'billing@company.com',
      body: 'Please find attached the invoice for project services.',
      timestamp: Date.now(),
    },
  ];

  describe('buildIndex', () => {
    it('creates an encrypted index from emails', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      // Verify ciphertext is not readable
      const ciphertextStr = Buffer.from(encrypted.ciphertext, 'base64').toString('utf-8');
      expect(ciphertextStr).not.toContain('project');
      expect(ciphertextStr).not.toContain('alice');
    });

    it('encrypted index is not readable without the key', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);
      const wrongKey = crypto.randomBytes(32);

      expect(() => {
        searchIndex.search('project', encrypted, wrongKey);
      }).toThrow();
    });
  });

  describe('search', () => {
    it('returns correct results after decryption', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);

      const results = searchIndex.search('project', encrypted, encryptionKey);

      expect(results.length).toBeGreaterThan(0);
      const emailIds = results.map((r) => r.emailId);
      expect(emailIds).toContain('email-1');
      expect(emailIds).toContain('email-3');
    });

    it('searches across subject, sender, and body', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);

      // Search by sender
      const senderResults = searchIndex.search('alice', encrypted, encryptionKey);
      expect(senderResults.some((r) => r.emailId === 'email-1')).toBe(true);

      // Search by subject term
      const subjectResults = searchIndex.search('meeting', encrypted, encryptionKey);
      expect(subjectResults.some((r) => r.emailId === 'email-2')).toBe(true);

      // Search by body term
      const bodyResults = searchIndex.search('budget', encrypted, encryptionKey);
      expect(bodyResults.some((r) => r.emailId === 'email-2')).toBe(true);
    });

    it('returns empty results for non-matching query', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);
      const results = searchIndex.search('xyznonexistent', encrypted, encryptionKey);
      expect(results).toHaveLength(0);
    });

    it('returns empty results for empty query', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);
      const results = searchIndex.search('', encrypted, encryptionKey);
      expect(results).toHaveLength(0);
    });

    it('results are sorted by relevance score', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);
      const results = searchIndex.search('project', encrypted, encryptionKey);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });
  });

  describe('addToIndex', () => {
    it('adds a new email to an existing encrypted index', () => {
      const encrypted = searchIndex.buildIndex(testEmails, encryptionKey);

      const newEmail: IndexableEmail = {
        id: 'email-4',
        subject: 'New Feature Request',
        sender: 'product@example.com',
        body: 'We need to add a new search feature to the application.',
        timestamp: Date.now(),
      };

      const updatedIndex = searchIndex.addToIndex(newEmail, encrypted, encryptionKey);

      // Search for the new email
      const results = searchIndex.search('feature', updatedIndex, encryptionKey);
      expect(results.some((r) => r.emailId === 'email-4')).toBe(true);

      // Old emails still searchable
      const oldResults = searchIndex.search('budget', updatedIndex, encryptionKey);
      expect(oldResults.some((r) => r.emailId === 'email-2')).toBe(true);
    });
  });
});
