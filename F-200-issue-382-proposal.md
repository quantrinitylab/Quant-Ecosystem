# Issue #382 — Canonicalization Proposal: receipt-before-success (F-200)

**Source:** QuantAI lane, deep-loop finding F-200 (P1, cross-app).
**Conflict source:** war-room Interconnection Plan v1 (COPPER-TIGER "ACCEPT WITH CONFLICTS").
**Proposed by:** QuantAI lane. **Status:** draft, NOT yet posted (write path blocked).

## The problem

`packages/http-connectors` treats **any HTTP 2xx** as success, with no owner-receipt
verification (no `messageId` / `draftId` / `eventId`). A sibling backend that returns
`200 {"success": true}` — accepted the request, URL navigated, nothing persisted —
is reported to the user as a completed action. That is a fake success.

## Proposed canonical contract (all lanes, all apps)

**Law: receipt-before-success.** A mutating cross-app call is successful ONLY when the
owner backend's response carries a real, non-empty, owner-issued receipt:

| Operation kind | Required receipt field(s) | Example |
|---|---|---|
| send message | `messageId` | mail send → `messageId: "m-..."` |
| create draft | `draftId` (or `id`) | mail draft → `draftId: "d-..."` |
| create document | `docId` (or `id`) | docs create → `docId: "doc-..."` |
| create event | `id` (or `eventId`) | calendar event → `id: "ev-..."` |
| produce artifact | the artifact itself (non-empty) | summarize → `summary` text; AI review → `summary` text |

Rules:
1. **HTTP 2xx without a receipt = NOT success.** Fail closed with an honest error
   (`UPSTREAM_RECEIPT_MISSING`, HTTP 502) — never report it as completed.
2. **Read-only ops are exempt.** Empty 2xx results are honest results; no receipt needed.
3. Receipt fields must be non-empty strings after trimming (whitespace-only is malformed).
4. Every cross-app request gets a bounded timeout; a hung backend fails closed
   (`UPSTREAM_TIMEOUT`, HTTP 502), never stalls the caller.
5. Error payloads must carry structured details: `{ app, path, expectedReceiptKeys }`
   (or `{ timeoutMs }`) so the orchestrator and the user see *why* it failed.

## What the QuantAI lane already implements (local, unpushed)

`apps/quantai/backend/services/http-connectors.service.ts` (`HttpAppConnectors`):
- New `callWithReceipt(app, path, receiptKeys, init)` helper — all mutating methods
  (`mail.draft`, `docs.create`, `calendar.createEvent`, `drive.summarize`,
  `code.reviewPullRequest`) route through it; reads unchanged.
- New per-request `timeoutMs` option (default 15s) raced against fetch in `call()`.
- 18 vitest tests (receipt success/missing/malformed/whitespace + reads unaffected
  + timeout fail-closed + healthy-backend sanity) + neighbor suites + tsc green.

## Ask of the war room

1. Ratify receipt-before-success as the ecosystem-wide cross-app contract.
2. `packages/http-connectors` (out of the QuantAI lane — owned by another lane) to be
   updated the same way, or expose owner receipts on its mutating surfaces so lane
   adapters can verify.
3. QuantMail (identity/app owner) to document the receipt fields each mutating
   endpoint returns (`messageId`, `draftId`, `eventId`, …) as part of the v1 contract.
