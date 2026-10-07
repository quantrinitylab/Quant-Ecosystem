/**
 * QuantMail SQLite FTS5 Wasm / In-Memory Indexer Module
 * Task M15 / Gate 3 Indexed Search Parity
 */

export * from './types';
export * from './schema';
export * from './porter-stemmer';
export * from './fts5-engine';
export * from './indexer';

export { getFts5Indexer, SqliteFts5Indexer } from './indexer';
