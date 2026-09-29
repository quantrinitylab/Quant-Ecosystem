import { describe, it, expect, beforeEach } from 'vitest';
import {
  SqliteFts5Indexer,
  getFts5Indexer,
  FTS5_SCHEMA_DDL,
  FTS5_SEARCH_SQL,
  FTS5_INSERT_OR_REPLACE_SQL,
  type EmailItem,
} from '../sqlite-fts5';

describe('Task M15 / Gate 3: Superhuman SQLite FTS5 Wasm Local Email Search Indexer', () => {
  let indexer: SqliteFts5Indexer;

  beforeEach(() => {
    indexer = new SqliteFts5Indexer();
  });

  describe('1. SQLite FTS5 Virtual Table Schema & SQL Contracts', () => {
    it('defines exact SQLite FTS5 virtual table schema with porter and unicode61 tokenizer', () => {
      const ddl = indexer.getSchemaDdl();
      expect(ddl).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5');
      expect(ddl).toContain('id UNINDEXED');
      expect(ddl).toContain('threadId UNINDEXED');
      expect(ddl).toContain('subject');
      expect(ddl).toContain('snippet');
      expect(ddl).toContain('bodyText');
      expect(ddl).toContain('fromAddress');
      expect(ddl).toContain('toAddress');
      expect(ddl).toContain('receivedAt UNINDEXED');
      expect(ddl).toContain("tokenize='porter unicode61'");
    });

    it('provides canonical SQLite FTS5 query SQL with snippet and bm25', () => {
      const sql = indexer.getSearchSql();
      expect(sql).toContain('SELECT');
      expect(sql).toContain('id,');
      expect(sql).toContain('threadId,');
      expect(sql).toContain('subject,');
      expect(sql).toContain('snippet,');
      expect(sql).toContain(
        "snippet(emails_fts, 2, '<mark>', '</mark>', '...', 12) as matchSnippet",
      );
      expect(sql).toContain('bm25(emails_fts) as rank');
      expect(sql).toContain('WHERE emails_fts MATCH ?');
      expect(sql).toContain('ORDER BY rank');
      expect(sql).toContain('LIMIT ? OFFSET ?');
    });

    it('provides canonical INSERT OR REPLACE statement', () => {
      const insertSql = indexer.getInsertOrReplaceSql();
      expect(insertSql).toContain('INSERT OR REPLACE INTO emails_fts');
    });
  });

  describe('2. Batch Email Indexing (Subject, Body, From, To fields)', () => {
    it('indexes batch of emails and supports both EmailItem and Email formats', () => {
      const sampleEmails: EmailItem[] = [
        {
          id: 'mail_001',
          threadId: 'th_001',
          subject: 'Q3 Architectural Engineering Review',
          snippet: 'Please find attached the slides for the Q3 architecture review.',
          bodyText:
            'We will cover Kubernetes pod scaling, Praefect clusters, and SQLite FTS5 local indexing.',
          fromAddress: 'alice@quantmail.in',
          toAddress: 'team@quantmail.in, bob@quantmail.in',
          receivedAt: '2026-09-26T10:00:00Z',
        },
        {
          id: 'mail_002',
          threadId: 'th_002',
          subject: 'Security Audit & Penetration Testing Report',
          snippet: 'Summary of findings from our third-party external penetration audit.',
          bodyText:
            'All OAuth endpoints and SES suppression lists are secure and compliant with ISO 27001.',
          from: { email: 'security@quantmail.in', name: 'Security Sentinel' },
          to: [{ email: 'ciso@quantmail.in', name: 'Chief Security Officer' }],
          receivedAt: new Date('2026-09-26T11:00:00Z'),
        },
        {
          id: 'mail_003',
          threadId: 'th_003',
          subject: 'Invoice #9482 for Cloudflare Egress Services',
          snippet: 'Your monthly invoice for Cloudflare R2 and Turnstile usage is ready.',
          bodyText:
            'Zero egress costs applied for 4.2TB transferred. Payment processed via Stripe.',
          fromAddress: 'billing@cloudflare.com',
          toAddress: 'accounting@quantmail.in',
          date: '2026-09-26T12:00:00Z',
        },
      ];

      indexer.indexEmails(sampleEmails);
      expect(indexer.size()).toBe(3);
      expect(indexer.hasEmail('mail_001')).toBe(true);
      expect(indexer.hasEmail('mail_002')).toBe(true);
      expect(indexer.hasEmail('mail_003')).toBe(true);

      // Search by subject
      const subjectResults = indexer.search('Architectural');
      expect(subjectResults.length).toBe(1);
      expect(subjectResults[0].id).toBe('mail_001');

      // Search by bodyText
      const bodyResults = indexer.search('Kubernetes');
      expect(bodyResults.length).toBe(1);
      expect(bodyResults[0].id).toBe('mail_001');

      // Search by fromAddress
      const fromResults = indexer.search('from:security@quantmail.in');
      expect(fromResults.length).toBe(1);
      expect(fromResults[0].id).toBe('mail_002');

      // Search by toAddress
      const toResults = indexer.search('to:accounting@quantmail.in');
      expect(toResults.length).toBe(1);
      expect(toResults[0].id).toBe('mail_003');
    });

    it('asynchronously indexes batches with microtask chunking', async () => {
      const items: EmailItem[] = Array.from({ length: 50 }, (_, i) => ({
        id: `async_mail_${i}`,
        threadId: `th_async_${Math.floor(i / 5)}`,
        subject: `Async Task notification ${i}`,
        snippet: `Notification snippet for payload ${i}`,
        bodyText: `Body text containing unique token token_${i}`,
        fromAddress: `sender_${i}@quantmail.in`,
        toAddress: 'receiver@quantmail.in',
      }));

      const count = await indexer.indexEmailsAsync(items, 15);
      expect(count).toBe(50);
      expect(indexer.size()).toBe(50);

      const hit = indexer.search('token_42');
      expect(hit.length).toBe(1);
      expect(hit[0].id).toBe('async_mail_42');
    });

    it('performs idempotent update when re-indexing an existing email ID', () => {
      indexer.indexEmails([
        {
          id: 'mutable_01',
          threadId: 'th_mut',
          subject: 'Draft proposal v1',
          snippet: 'Initial thoughts',
          bodyText: 'First draft content',
        },
      ]);
      expect(indexer.size()).toBe(1);

      // Re-index with updated subject
      indexer.indexEmails([
        {
          id: 'mutable_01',
          threadId: 'th_mut',
          subject: 'Final proposal v2 approved',
          snippet: 'Final ratified version',
          bodyText: 'Ratified content approved by leadership',
        },
      ]);
      expect(indexer.size()).toBe(1);

      const oldSearch = indexer.search('Initial');
      expect(oldSearch.length).toBe(0);

      const newSearch = indexer.search('Ratified');
      expect(newSearch.length).toBe(1);
      expect(newSearch[0].id).toBe('mutable_01');
    });
  });

  describe('3. Exact Phrase Match and Multi-Term Boolean Search', () => {
    beforeEach(() => {
      indexer.indexEmails([
        {
          id: 'phrase_doc_1',
          threadId: 'th_1',
          subject: 'Weekly Status: Quarterly Earnings Report',
          snippet: 'Here is the quarterly earnings report as discussed in executive staff.',
          bodyText: 'Revenue increased by 38% year over year with positive EBITDA.',
          fromAddress: 'cfo@quantmail.in',
        },
        {
          id: 'phrase_doc_2',
          threadId: 'th_2',
          subject: 'Unrelated Thoughts on Earnings and Quarterly Goals',
          snippet:
            'We must examine our quarterly goals before our earnings are revealed in the report later.',
          bodyText:
            'The words quarterly, earnings, and report are scattered across separate paragraphs.',
          fromAddress: 'analyst@quantmail.in',
        },
        {
          id: 'boolean_doc_1',
          threadId: 'th_3',
          subject: 'Urgent approval needed for legal contract',
          snippet: 'Please review and execute sign-off immediately.',
          bodyText: 'Urgent contract approval for the vendor agreement.',
          fromAddress: 'legal@quantmail.in',
        },
        {
          id: 'boolean_doc_2',
          threadId: 'th_4',
          subject: 'Standard newsletter digest',
          snippet: 'Community updates and general announcements.',
          bodyText: 'Routine weekly memo with no urgent actions.',
          fromAddress: 'newsletter@community.org',
        },
      ]);
    });

    it('matches exact phrase in quotes only when tokens appear consecutively', () => {
      // "quarterly earnings report" should match phrase_doc_1 only, NOT phrase_doc_2 where words are scattered
      const phraseHits = indexer.search('"quarterly earnings report"');
      expect(phraseHits.length).toBe(1);
      expect(phraseHits[0].id).toBe('phrase_doc_1');
    });

    it('performs multi-term boolean AND search by default', () => {
      const andHits = indexer.search('urgent approval');
      expect(andHits.length).toBe(1);
      expect(andHits[0].id).toBe('boolean_doc_1');

      const explicitAnd = indexer.search('urgent AND approval');
      expect(explicitAnd.length).toBe(1);
      expect(explicitAnd[0].id).toBe('boolean_doc_1');
    });

    it('performs multi-term boolean OR search', () => {
      const orHits = indexer.search('quarterly OR newsletter');
      expect(orHits.length).toBe(3);
      const hitIds = orHits.map((h) => h.id);
      expect(hitIds).toContain('phrase_doc_1');
      expect(hitIds).toContain('phrase_doc_2');
      expect(hitIds).toContain('boolean_doc_2');
    });

    it('performs boolean NOT search exclusion', () => {
      const notHits = indexer.search('quarterly NOT unrelated');
      expect(notHits.length).toBe(1);
      expect(notHits[0].id).toBe('phrase_doc_1');
    });
  });

  describe('4. BM25 Rank Sorting and <mark> Snippet Generation', () => {
    it('ranks subject matches higher than body matches due to field weight prioritization', () => {
      indexer.indexEmails([
        {
          id: 'body_match_only',
          threadId: 'th_a',
          subject: 'Team Lunch Sync',
          snippet: 'General calendar invite for lunch tomorrow.',
          bodyText: 'We can discuss the critical migration architecture over lunch.',
          fromAddress: 'dev@quantmail.in',
        },
        {
          id: 'subject_match_primary',
          threadId: 'th_b',
          subject: 'Critical Migration Architecture Review',
          snippet: 'Agenda slides for the upcoming architecture session.',
          bodyText: 'Details on the database cluster.',
          fromAddress: 'lead@quantmail.in',
        },
      ]);

      const hits = indexer.search('critical migration architecture');
      expect(hits.length).toBe(2);
      // In SQLite FTS5 bm25, lower rank is better
      expect(hits[0].id).toBe('subject_match_primary');
      expect(hits[1].id).toBe('body_match_only');
      expect(hits[0].rank).toBeLessThan(hits[1].rank);
    });

    it('generates <mark> highlighted snippet matching SQLite FTS5 snippet function', () => {
      indexer.indexEmails([
        {
          id: 'snippet_doc',
          threadId: 'th_snip',
          subject: 'Production Incident Postmortem',
          snippet:
            'The database cluster experienced high memory pressure during peak morning traffic.',
          bodyText: 'Memory pressure was resolved by scaling read replicas in AWS us-east-1.',
        },
      ]);

      const hits = indexer.search('memory pressure');
      expect(hits.length).toBe(1);
      const matchSnippet = hits[0].matchSnippet;
      expect(matchSnippet).toContain('<mark>memory</mark>');
      expect(matchSnippet).toContain('<mark>pressure</mark>');
    });
  });

  describe('5. Prefix Query Wildcard Matching (repo* matching repository)', () => {
    it('matches terms with prefix wildcard repo* matching repository and repositories', () => {
      indexer.indexEmails([
        {
          id: 'repo_doc_1',
          threadId: 'th_r1',
          subject: 'QuantGit Sovereign Repository Manager',
          snippet: 'Manage your git repository with Praefect 3-node Raft clusters.',
          bodyText: 'Local Git HTTP server with sovereign tree inspection.',
        },
        {
          id: 'repo_doc_2',
          threadId: 'th_r2',
          subject: 'Syncing all repositories to remote vault',
          snippet: 'Automated backup of enterprise repositories to encrypted Cloudflare R2.',
          bodyText: 'Repository mirroring daemon runs every midnight.',
        },
        {
          id: 'repo_doc_3',
          threadId: 'th_r3',
          subject: 'Annual financial report',
          snippet: 'Summary of annual accounts and balance sheets.',
          bodyText: 'Report filed with regulatory authority.',
        },
      ]);

      // Query with prefix wildcard "repo*"
      const prefixHits = indexer.search('repo*');
      expect(prefixHits.length).toBeGreaterThanOrEqual(2);
      const hitIds = prefixHits.map((h) => h.id);
      expect(hitIds).toContain('repo_doc_1');
      expect(hitIds).toContain('repo_doc_2');
    });

    it('stems terms with porter stemmer matching different word forms', () => {
      indexer.indexEmails([
        {
          id: 'stem_doc',
          threadId: 'th_s1',
          subject: 'Connecting all devices to the mesh VPN',
          snippet: 'Network connections established across all cluster nodes.',
          bodyText: 'The connection protocol is resilient to disconnections.',
        },
      ]);

      // Searching for "connect" matches "connecting", "connections", "connection"
      const res = indexer.search('connect');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('stem_doc');
    });
  });

  describe('6. Fuzzy / Prefix Match Fallback on Zero Hits', () => {
    it('automatically recovers from incomplete typed query via prefix fallback', () => {
      indexer.indexEmails([
        {
          id: 'crypto_doc',
          threadId: 'th_c1',
          subject: 'Cryptographic Key Exchange Protocol',
          snippet: 'Details on Curve25519 and Ed25519 signed pre-keys.',
          bodyText: 'Zero-knowledge encryption for end-to-end messaging.',
        },
      ]);

      // Incomplete query typed by user: "cryptogr" (does not exist as full word)
      const res = indexer.searchDetailed('cryptogr');
      expect(res.results.length).toBe(1);
      expect(res.results[0].id).toBe('crypto_doc');
      expect(res.usedFallback).toBe(true);
    });
  });

  describe('7. Sub-5ms Search Execution Benchmark Test', () => {
    it('indexes 1,000+ emails and achieves search latency p95 < 5.0ms', () => {
      const sampleVocab = [
        'security',
        'database',
        'architecture',
        'kubernetes',
        'performance',
        'encryption',
        'praefect',
        'superhuman',
        'cloudflare',
        'invoice',
        'deployment',
        'pipeline',
        'frontend',
        'backend',
        'cluster',
        'deliverability',
        'suppression',
        'websocket',
        'calendar',
        'storage',
      ];

      const emails: EmailItem[] = [];
      for (let i = 0; i < 1200; i++) {
        const v1 = sampleVocab[i % sampleVocab.length];
        const v2 = sampleVocab[(i * 3) % sampleVocab.length];
        const v3 = sampleVocab[(i * 7) % sampleVocab.length];

        emails.push({
          id: `bench_email_${i}`,
          threadId: `th_bench_${Math.floor(i / 4)}`,
          subject: `Sprint Update on ${v1} and ${v2} component ${i}`,
          snippet: `Executive summary regarding ${v2} and ${v3} engineering rollout.`,
          bodyText: `Detailed analysis of ${v1}, ${v2}, and ${v3} metrics. Latency is sub-5ms across all pods.`,
          fromAddress: `engineer_${i % 50}@quantmail.in`,
          toAddress: 'lead@quantmail.in',
          receivedAt: new Date(Date.now() - i * 3600000).toISOString(),
        });
      }

      indexer.indexEmails(emails);
      expect(indexer.size()).toBe(1200);

      // Warm-up query
      indexer.search('architecture');

      // Execute 40 benchmark search queries and measure execution latency
      const latencies: number[] = [];

      for (let j = 0; j < 40; j++) {
        const term = sampleVocab[j % sampleVocab.length];
        const t0 = performance.now();
        const results = indexer.search(term, { limit: 25 });
        const t1 = performance.now();

        latencies.push(t1 - t0);
        expect(results.length).toBeGreaterThan(0);
      }

      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const median = latencies[Math.floor(latencies.length * 0.5)];

      // Verify Superhuman-class sub-5ms performance requirement
      expect(p95).toBeLessThan(5.0);
      expect(median).toBeLessThan(2.0);
    });
  });

  describe('8. Global Singleton getFts5Indexer()', () => {
    it('returns shared singleton instance across modules', () => {
      const inst1 = getFts5Indexer();
      const inst2 = getFts5Indexer();
      expect(inst1).toBe(inst2);
    });
  });
});
