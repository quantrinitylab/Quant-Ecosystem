// ============================================================================
// ZK Email - Client Search Index
// Encrypted searchable index with client-side decryption + filter
// ============================================================================

import * as crypto from 'node:crypto';

export interface IndexableEmail {
  id: string;
  subject: string;
  sender: string;
  body: string;
  timestamp: number;
}

export interface IndexEntry {
  emailId: string;
  terms: string[];
}

export interface EncryptedIndex {
  ciphertext: string;
  nonce: string;
  authTag: string;
}

export interface SearchResult {
  emailId: string;
  score: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

function encryptData(data: string, key: Buffer): EncryptedIndex {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(data, 'utf-8')), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decryptData(encrypted: EncryptedIndex, key: Buffer): string {
  const nonce = Buffer.from(encrypted.nonce, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString('utf-8');
}

export class ClientSearchIndex {
  /**
   * Build a searchable index from emails and encrypt it with AES-256-GCM.
   * The index maps terms to email IDs for efficient search.
   */
  buildIndex(emails: IndexableEmail[], encryptionKey: Buffer): EncryptedIndex {
    const entries: IndexEntry[] = emails.map((email) => {
      const terms = [
        ...tokenize(email.subject),
        ...tokenize(email.sender),
        ...tokenize(email.body),
      ];
      // Deduplicate terms
      const uniqueTerms = [...new Set(terms)];
      return { emailId: email.id, terms: uniqueTerms };
    });

    const indexData = JSON.stringify(entries);
    return encryptData(indexData, encryptionKey);
  }

  /**
   * Search the encrypted index after client-side decryption.
   * Returns matching email IDs sorted by relevance score.
   */
  search(query: string, encryptedIndex: EncryptedIndex, decryptionKey: Buffer): SearchResult[] {
    const indexData = decryptData(encryptedIndex, decryptionKey);
    const entries: IndexEntry[] = JSON.parse(indexData);
    const queryTerms = tokenize(query);

    if (queryTerms.length === 0) {
      return [];
    }

    const results: SearchResult[] = [];

    for (const entry of entries) {
      let score = 0;
      for (const queryTerm of queryTerms) {
        for (const term of entry.terms) {
          if (term.includes(queryTerm) || queryTerm.includes(term)) {
            score++;
          }
        }
      }
      if (score > 0) {
        results.push({ emailId: entry.emailId, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Add a new email to an existing encrypted index.
   * Decrypts, appends, and re-encrypts.
   */
  addToIndex(
    email: IndexableEmail,
    encryptedIndex: EncryptedIndex,
    encryptionKey: Buffer,
  ): EncryptedIndex {
    const indexData = decryptData(encryptedIndex, encryptionKey);
    const entries: IndexEntry[] = JSON.parse(indexData);

    const terms = [...tokenize(email.subject), ...tokenize(email.sender), ...tokenize(email.body)];
    const uniqueTerms = [...new Set(terms)];
    entries.push({ emailId: email.id, terms: uniqueTerms });

    const updatedData = JSON.stringify(entries);
    return encryptData(updatedData, encryptionKey);
  }
}
