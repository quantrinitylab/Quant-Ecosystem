// ============================================================================
// QuantChat — EncryptedSearchIndex (W5, design Component 5)
// ============================================================================
//
// Makes E2EE messages searchable WITHOUT breaking end-to-end encryption.
// Server-side full-text over ciphertext is impossible by design, so search uses
// a client-built BLIND INDEX: the client tokenizes plaintext, computes
// HMAC(Search_Key, token) for each distinct token, and uploads only the opaque
// token hashes. The server stores and matches token hashes only — it never sees
// plaintext tokens, message plaintext, or any key material (design Algorithm 5).
//
// Zero-knowledge invariant (Requirement 16): this service persists ONLY the
// message id, conversation id, owner (Search_Key) id, and opaque HMAC token
// hashes. Any uploaded entry carrying a field outside that allow-list is
// rejected and nothing is persisted (Requirement 14.4).
// ============================================================================

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type { PaginationOptions, PaginatedResult } from './message.service';

/**
 * A blind-index upload from the client. Carries ONLY the message id, the
 * conversation id, the owning user (the Search_Key owner), and the opaque HMAC
 * token hashes for one message. Conforms to the design's `BlindIndexEntry`
 * (Component 5) with the owner identifier the requirements mandate be persisted
 * and matched (Requirements 14.3, 15.5).
 *
 * No plaintext, ciphertext, private keys, or ratchet secrets ever appear here —
 * see {@link EncryptedSearchIndex.index} for the enforced field allow-list.
 */
export interface BlindIndexEntry {
  /** The message these token hashes belong to. */
  messageId: string;
  /** The conversation the message was sent in. */
  conversationId: string;
  /** Owner of the index / Search_Key (the user the entry is scoped to). */
  userId: string;
  /** HMAC(Search_Key, token) values — the server never sees plaintext tokens. */
  tokenHashes: string[];
  /** Optional client-supplied creation timestamp; defaults to now() when absent. */
  createdAt?: Date;
}

/** A candidate match returned by {@link EncryptedSearchIndex.search}. */
export interface SearchCandidate {
  messageId: string;
  conversationId: string;
}

/**
 * Server-side blind-index contract (design Component 5).
 *
 * - `index` accepts a client upload of hashed tokens for one message.
 * - `search` matches hashed query tokens against the stored index and returns
 *   owner-scoped candidate message identifiers (each at most once).
 */
export interface EncryptedSearchIndex {
  /** Client uploads hashed tokens for a newly sent message. */
  index(entry: BlindIndexEntry): Promise<void>;
  /** Server matches hashed query tokens; returns candidate messageIds. */
  search(
    userId: string,
    queryTokenHashes: string[],
    opts: PaginationOptions,
  ): Promise<PaginatedResult<SearchCandidate>>;
}

/**
 * The complete set of fields a {@link BlindIndexEntry} upload may contain. Any
 * other property causes the upload to be rejected so the server can never be
 * coerced into persisting plaintext, ciphertext, or key material
 * (Requirement 14.4).
 */
const ALLOWED_ENTRY_FIELDS: ReadonlySet<string> = new Set([
  'messageId',
  'conversationId',
  'userId',
  'tokenHashes',
  'createdAt',
]);

/** Default page size for blind-index search results. */
const DEFAULT_SEARCH_PAGE_SIZE = 20;

/**
 * Build an empty {@link PaginatedResult} for the requested page. Used when a
 * query has no token hashes, or when no blind-index entries exist for the
 * requested range (legacy messages pending a client-side reindex —
 * Requirement 15.8).
 */
function emptyResult<T>(page: number, pageSize: number): PaginatedResult<T> {
  return {
    data: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    hasNext: false,
    hasPrev: page > 1,
  };
}

/**
 * Prisma-backed {@link EncryptedSearchIndex}.
 *
 * The backend remains a zero-knowledge relay: this service reads and writes
 * only the `blind_index_entries` table (message id, conversation id, owner id,
 * opaque token hash) and never touches message plaintext or private keys
 * (Requirements 15.6, 16.1).
 */
export class PrismaEncryptedSearchIndex implements EncryptedSearchIndex {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persist a client-built blind-index entry as one row per distinct token
   * hash, storing ONLY the message id, conversation id, owner id, and token
   * hash values (Requirements 14.3, 16.1).
   *
   * The upload is validated up front and rejected in its entirety — persisting
   * nothing — when it carries any field outside {@link ALLOWED_ENTRY_FIELDS} or
   * when a required field is missing or malformed (Requirement 14.4). This is
   * what stops a caller from smuggling plaintext, ciphertext, or key material
   * into the zero-knowledge store.
   */
  async index(entry: BlindIndexEntry): Promise<void> {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw createAppError('Blind-index entry must be an object', 400, 'INVALID_INDEX_ENTRY');
    }

    // Reject any field outside the allow-list. This is the core zero-knowledge
    // guard: an entry carrying e.g. `content`, `plaintext`, or a key is refused
    // and NOTHING is written (Requirement 14.4, 16.1, 16.2).
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_ENTRY_FIELDS.has(key)) {
        throw createAppError(
          `Blind-index entry contains a disallowed field: ${key}`,
          400,
          'INVALID_INDEX_ENTRY',
        );
      }
    }

    const { messageId, conversationId, userId, tokenHashes } = entry;

    if (typeof messageId !== 'string' || messageId.length === 0) {
      throw createAppError('Blind-index entry requires a messageId', 400, 'INVALID_INDEX_ENTRY');
    }
    if (typeof conversationId !== 'string' || conversationId.length === 0) {
      throw createAppError(
        'Blind-index entry requires a conversationId',
        400,
        'INVALID_INDEX_ENTRY',
      );
    }
    if (typeof userId !== 'string' || userId.length === 0) {
      throw createAppError(
        'Blind-index entry requires an owner userId',
        400,
        'INVALID_INDEX_ENTRY',
      );
    }
    if (
      !Array.isArray(tokenHashes) ||
      tokenHashes.some((hash) => typeof hash !== 'string' || hash.length === 0)
    ) {
      throw createAppError(
        'Blind-index entry tokenHashes must be an array of non-empty strings',
        400,
        'INVALID_INDEX_ENTRY',
      );
    }

    // Dedupe so the store keeps one row per distinct token hash for the message.
    const distinctHashes = Array.from(new Set(tokenHashes));
    if (distinctHashes.length === 0) {
      // A message with no searchable tokens contributes no index rows.
      return;
    }

    const createdAt = entry.createdAt ?? new Date();

    await this.prisma.blindIndexEntry.createMany({
      data: distinctHashes.map((tokenHash) => ({
        messageId,
        conversationId,
        userId,
        tokenHash,
        createdAt,
      })),
    });
  }

  /**
   * Match the supplied query token hashes against the stored blind index and
   * return candidate message identifiers, oldest token rows first.
   *
   * Results are:
   * - OWNER-SCOPED — only entries whose `userId` equals the requesting user are
   *   considered, so one user can never search another's index (Req 15.5).
   * - DEDUPED — each matching message id is returned at most once even when
   *   several of its tokens match the query (Req 15.2, 15.5).
   * - HASH-ONLY — matching is purely an equality test over opaque HMAC token
   *   hashes; no plaintext or key material is read (Req 15.6, 16.1).
   *
   * A message is a candidate iff it shares at least one token hash with the
   * query (Req 15.3); messages sharing no token hash are excluded (Req 15.4).
   * When no entries exist for the requested range (e.g. legacy messages not yet
   * reindexed by the client), an empty page is returned (Req 15.8).
   */
  async search(
    userId: string,
    queryTokenHashes: string[],
    opts: PaginationOptions = {},
  ): Promise<PaginatedResult<SearchCandidate>> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? DEFAULT_SEARCH_PAGE_SIZE;

    // No query tokens (or no owner) can never match anything.
    if (
      typeof userId !== 'string' ||
      userId.length === 0 ||
      !Array.isArray(queryTokenHashes) ||
      queryTokenHashes.length === 0
    ) {
      return emptyResult<SearchCandidate>(page, pageSize);
    }

    // Only non-empty string hashes are valid match keys.
    const distinctQueryHashes = Array.from(
      new Set(queryTokenHashes.filter((hash) => typeof hash === 'string' && hash.length > 0)),
    );
    if (distinctQueryHashes.length === 0) {
      return emptyResult<SearchCandidate>(page, pageSize);
    }

    const skip = (page - 1) * pageSize;
    const hashList = Prisma.join(distinctQueryHashes);

    // Owner-scoped, deduped candidate message ids. We GROUP BY the message so a
    // message that matches on several tokens is returned exactly once, and order
    // by the earliest matching row for stable pagination. MIN("conversationId")
    // is a no-op pick (a message belongs to exactly one conversation).
    const rows = await this.prisma.$queryRaw<
      Array<{ messageId: string; conversationId: string }>
    >(Prisma.sql`
      SELECT "messageId",
             MIN("conversationId") AS "conversationId"
        FROM "blind_index_entries"
       WHERE "userId" = ${userId}
         AND "tokenHash" IN (${hashList})
       GROUP BY "messageId"
       ORDER BY MIN("createdAt") ASC, "messageId" ASC
       LIMIT ${pageSize}
      OFFSET ${skip}
    `);

    // Total number of distinct matching messages for pagination metadata.
    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT "messageId") AS "count"
        FROM "blind_index_entries"
       WHERE "userId" = ${userId}
         AND "tokenHash" IN (${hashList})
    `);

    const total = Number(countRows[0]?.count ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      data: rows.map((row) => ({
        messageId: row.messageId,
        conversationId: row.conversationId,
      })),
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
