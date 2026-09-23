import { describe, it, expect } from 'vitest';
import {
  EMAIL_TABLE_DDL,
  FTS5_TABLE_DDL,
  FTS5_TRIGGERS_DDL,
  EmailRecord,
} from '../workers/fts-schema.js';
import { sanitizeFts5Term, buildFts5QuerySql, InMemoryFts5Engine } from '../workers/fts-query.js';

describe('Task W35-02: External Content FTS5 Schema & Sub-8ms BM25 Ranking Engine', () => {
  describe('Schema & DDL Definitions', () => {
    it('defines valid external content FTS5 table with unicode61 tokenizer', () => {
      expect(FTS5_TABLE_DDL).toContain("content='emails'");
      expect(FTS5_TABLE_DDL).toContain("content_rowid='rowid'");
      expect(FTS5_TABLE_DDL).toContain('unicode61 remove_diacritics 2 prefix "2 3 4"');
    });

    it('defines triggers for insert, update, and delete synchronization', () => {
      expect(FTS5_TRIGGERS_DDL).toContain('emails_ai AFTER INSERT ON emails');
      expect(FTS5_TRIGGERS_DDL).toContain('emails_ad AFTER DELETE ON emails');
      expect(FTS5_TRIGGERS_DDL).toContain('emails_au AFTER UPDATE ON emails');
      expect(FTS5_TRIGGERS_DDL).toContain("'delete', old.rowid");
    });
  });

  describe('Query Sanitizer & SQL Builder', () => {
    it('sanitizes user search terms and applies prefix wildcards', () => {
      expect(sanitizeFts5Term('invoice')).toBe('"invoice"*');
      expect(sanitizeFts5Term('quarterly report')).toBe('"quarterly"* "report"*');
      expect(sanitizeFts5Term('"exact match phrase"')).toBe('"exact match phrase"');
      expect(sanitizeFts5Term('urgent AND approval')).toBe('"urgent"* AND "approval"*');
      expect(sanitizeFts5Term('from:alice@quant.local')).toBe('sender:"alice@quant.local"*');
    });

    it('constructs BM25 ranking SQL with specified field weights', () => {
      const { sql, weightsClause } = buildFts5QuerySql({
        weights: { subject: 10.0, snippet: 5.0, sender: 2.0, recipient: 1.0 },
      });

      expect(weightsClause).toBe('10.0, 5.0, 2.0, 1.0');
      expect(sql).toContain('bm25(emails_fts, 10.0, 5.0, 2.0, 1.0) AS bm25_rank');
      expect(sql).toContain("snippet(emails_fts, 1, '<mark>', '</mark>', '...', 15)");
      expect(sql).toContain('ORDER BY bm25_rank ASC');
    });
  });

  describe('BM25 Ranking & Sub-8ms Performance Engine', () => {
    it('ranks subject matches higher than snippet matches due to 10.0 vs 5.0 weight', () => {
      const engine = new InMemoryFts5Engine();

      const emails: EmailRecord[] = [
        {
          id: 'doc_snippet_match',
          thread_id: 'th_1',
          sender: 'colleague@quant.local',
          recipient: 'me@quant.local',
          subject: 'Weekly Team Catchup Notes',
          snippet: 'Please remember to review the confidential budget proposal before the sync.',
          date: 1000,
          folder: 'INBOX',
          read: 1,
          starred: 0,
        },
        {
          id: 'doc_subject_match',
          thread_id: 'th_2',
          sender: 'cfo@quant.local',
          recipient: 'me@quant.local',
          subject: 'Confidential Budget Proposal 2027',
          snippet: 'Attached are the official slides for the upcoming board meeting.',
          date: 2000,
          folder: 'INBOX',
          read: 1,
          starred: 1,
        },
      ];

      engine.indexBatch(emails);

      const res = engine.search('confidential budget');
      expect(res.results.length).toBe(2);
      // The subject match should rank first
      expect(res.results[0].id).toBe('doc_subject_match');
      expect(res.results[1].id).toBe('doc_snippet_match');
      // In SQLite bm25() lower rank is better (bm25_rank is negative score in our adapter)
      expect(res.results[0].bm25_rank).toBeLessThan(res.results[1].bm25_rank);
    });

    it('indexes 2,500 emails and achieves search latency < 8.0ms', () => {
      const engine = new InMemoryFts5Engine();

      const sampleWords = [
        'security',
        'deploy',
        'architecture',
        'kubernetes',
        'praefect',
        'database',
        'frontend',
        'backend',
        'performance',
        'latency',
        'encryption',
        'signal',
        'webrtc',
        'ffmpeg',
        'auction',
        'creator',
        'revenue',
        'stripe',
        'payout',
        'pipeline',
        'compiler',
        'audit',
        'governance',
        'calendar',
        'workflow',
      ];

      const batch: EmailRecord[] = [];
      for (let i = 0; i < 2500; i++) {
        const w1 = sampleWords[i % sampleWords.length];
        const w2 = sampleWords[(i * 3) % sampleWords.length];
        const w3 = sampleWords[(i * 7) % sampleWords.length];

        batch.push({
          id: `msg_perf_${i}`,
          thread_id: `th_perf_${Math.floor(i / 3)}`,
          sender: `user_${i % 100}@quantmail.in`,
          recipient: 'lead@quantmail.in',
          subject: `Update on ${w1} and ${w2} sprint milestone ${i}`,
          snippet: `This report details the work done regarding ${w2} and ${w3}. System metrics are stable.`,
          date: Date.now() - i * 60000,
          folder: i % 5 === 0 ? 'ARCHIVE' : 'INBOX',
          read: i % 2,
          starred: i % 10 === 0 ? 1 : 0,
        });
      }

      const indexRes = engine.indexBatch(batch);
      expect(indexRes.count).toBe(2500);

      // Warm-up query
      engine.search('deploy');

      // Execute 20 search queries and measure p95 latency
      const latencies: number[] = [];
      for (let j = 0; j < 20; j++) {
        const queryTerm = sampleWords[j % sampleWords.length];
        const res = engine.search(queryTerm, { limit: 20 });
        latencies.push(res.durationMs);
        expect(res.results.length).toBeGreaterThan(0);
      }

      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      // Acceptance criteria: sub-8ms latency
      expect(p95).toBeLessThan(8.0);
    });
  });
});
