# 🏛️ PHASE N: COLLABORATION ARCHITECTURE & BLOCK EDITOR DECISIONS MEMO

- **Author**: Developer 5 (Docs & Realtime Collaboration Lead)
- **Reviewer & Sovereign Approver**: CEO Astra (Opus 5 / Executive Architecture Lead)
- **Status**: RATIFIED & ARCHITECTURALLY BINDING
- **Scope**: QuantMail / QuantDrive Document System, Yjs CRDT Gateway, TipTap Editor Stack
- **Target Wave**: Wave 13.1 Governance Gate & Wave 9 (Phase N Sprints)

---

## Executive Summary

This Architecture Decision Record formally addresses and binds the five critical architectural gates (**N-G1 through N-G5**) formulated during the CEO Astra Wave 13 audit. It establishes the concrete implementation invariants for bringing Notion-class block editing and real-time multiplayer collaboration to the Quant Ecosystem without architectural debt, proprietary lock-in, or multi-CRDT confusion.

---

## Gate N-G1: Canonical Route Surface & Product Nomenclature

### Ruling:

1. **Route Home**: All document editing and browsing surfaces live canonically under:
   ```
   /drive/doc/[docId]
   ```
   and nested workspace paths:
   ```
   /workspaces/[workspaceId]/drive/doc/[docId]
   ```
2. **Branding Retirement**: The standalone name and separate app identity **"QuantDocs" is permanently retired**. Documents are native collaborative files within **QuantDrive**, managed inside the unified QuantMail flagship shell.
3. **Database Unification**: A document is backed by PostgreSQL table `documents` with a 1:1 foreign relation to `drive_files`. This guarantees that permissions, tags, trash/recovery, search indexing, and sharing mechanics are unified across files and rich documents.

---

## Gate N-G2: Editor Engine & Extensibility Contract

### Ruling:

1. **Core Framework**: **ProseMirror / TipTap Core** (MIT licensed only).
2. **Commercial License Invariant**: **Zero commercial TipTap Pro extensions**. No third-party cloud dependencies (e.g., Tiptap Cloud, Y-Sweet Cloud) or proprietary paid packages may enter the codebase.
3. **Slash Menu Architecture**: The slash command block menu is built 100% in-house using TipTap's standard suggestion plugin API and Tailwind design tokens:
   - Blocks supported: Paragraph, H1, H2, H3, Bullet List, Numbered List, Task Checklist (`[ ]`), Blockquote, Code Block (with Prism/highlight.js syntax), Table (MIT `@tiptap/extension-table`), Callout, Horizontal Rule.
4. **BlockSuite Exclusion**: **BlockSuite is explicitly rejected**.
   - _Rationale_: BlockSuite introduces an incompatible proprietary block-tree model, multi-megabyte bundle overhead, severe hydration mismatches with Next.js 15 / React 19, and unnecessary maintenance friction. ProseMirror is the proven industry standard for document collaboration.

---

## Gate N-G3: CRDT State Engine & Single-Framework Invariant

### Ruling:

1. **Canonical CRDT**: **Yjs (`yjs`) is the sole canonical CRDT framework** for the entire Quant Ecosystem.
2. **Automerge Exclusion**: Automerge is strictly prohibited from the document editing path. Dual-CRDT bridging or multi-engine abstraction layers are banned to prevent data corruption, non-deterministic conflict resolution, and memory bloat.
3. **Protocol Standards**:
   - Updates use standard Yjs binary encoding (`Y.encodeStateAsUpdate`, `Y.applyUpdate`).
   - Awareness and cursor presences use `y-protocols/awareness`.
   - Client-server synchronization conforms to the standard Yjs two-step handshake:
     1. Client sends state vector (`sync-step-1`).
     2. Server responds with missing updates (`sync-step-2`).
     3. Incremental updates broadcast to active peers in the room.

---

## Gate N-G4: Persistence vs Real-Time Relay Architecture & E2EE Invariants

### Ruling:

1. **Server-Side Persistence for Collaborative Team Docs**:
   - Team workspaces require full searchability, version history, audit logs, and asynchronous editing.
   - Updates are durably written to PostgreSQL in `collab_document_updates` with monotonic sequence numbers.
   - Fastify background compaction jobs periodically squash incremental updates into baseline snapshot blobs stored in S3-compatible storage.
2. **End-to-End Encrypted (E2EE) Isolation**:
   - Pure client-side E2EE (where the server acts solely as a zero-knowledge binary relay) is strictly isolated to **"Secret Notes" / "Vault Documents"**.
   - Secret Notes documents:
     - Are marked with `isZeroKnowledge: true`.
     - Keys are derived client-side via WebCrypto PBKDF2/AES-GCM from user passphrases.
     - Server stores only ciphertext blobs and never performs server-side indexing or search.
3. **Zero Leaks**: Normal team documents must NEVER claim zero-knowledge encryption if they are server-indexed; clear architectural truthfulness is maintained.

---

## Gate N-G5: Per-Frame Authorization & Tenant Isolation

### Ruling:

1. **Handshake & Session Authentication**:
   - WebSocket connection at `/collab/:docId` MUST pass a valid session cookie or `Authorization: Bearer <token>`.
   - Handshake performs immediate cryptographic verification of caller identity and resolves `userId` and active `workspaceId`.
   - Under no circumstances is `/collab` or any `/collab/*` subpath permitted in `publicPaths`.
2. **Tenancy & Permission Checks**:
   - The server verifies that the requested `docId` belongs to the user's active workspace and that the user holds at least `READ` permission (to join room) or `WRITE` permission (to broadcast updates).
   - If authorization fails, connection is immediately aborted with WebSocket close code **4403 (FORBIDDEN)**.
3. **Cross-Tenant Doc Rejection Invariant**:
   - Every incoming update frame is checked against room tenancy. An authenticated user belonging to Workspace A attempting to connect to or transmit frames for a document in Workspace B is immediately rejected and logged to the security audit trail.
   - Fastify test suites must include property-based tests verifying cross-tenant WebSocket rejection.

---

## Sign-Off Ledger

| Role                            | Name                   | Decision                        | Date       |
| :------------------------------ | :--------------------- | :------------------------------ | :--------- |
| **Executive Architecture Lead** | **CEO Astra (Opus 5)** | **APPROVED & RATIFIED**         | 2026-09-18 |
| **Docs & Collaboration Lead**   | **Developer 5**        | **SUBMITTED & ADOPTED**         | 2026-09-18 |
| **Auth & Security Gatekeeper**  | **Developer 1**        | **VERIFIED (Fail-Closed Gate)** | 2026-09-18 |
| **Sentinel & QA Lead**          | **Developer 2**        | **TEST CONTRACT BOUND**         | 2026-09-18 |
