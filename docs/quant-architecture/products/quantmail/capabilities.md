# QuantMail — Capability Architecture

This is the product-owned capability contract that feeds the ecosystem capability registry
(`@quant/app-registry`, doc 21 EC-01). It does not replace authorization. The registry
describes the capability; QuantMail policy and runtime authorization decide whether the
capability may execute.

Every capability below is registered in `packages/app-registry/src/capabilities.ts`.
Status `active` means the capability is wired to a real, verified backend route.
Status `preview` means declared in architecture, runtime wiring pending — never
presented as available.

## Capability groups

### Threads (source of truth: mailbox/thread/message domain)
| Capability | Risk | Status | Real route |
|---|---|---|---|
| `mail.thread.get` | 0 | active | `GET /threads/:id` — `apps/quantmail/backend/routes/threads.ts` |
| `mail.thread.search` | 0 | active | `GET /emails/search` — `apps/quantmail/backend/routes/emails.ts` |
| `mail.thread.archive` | 2 | active | `POST /emails/:id/archive` — `apps/quantmail/backend/routes/emails.ts` |
| `mail.thread.restore` | 2 | active | `POST /emails/:id/restore` — `apps/quantmail/backend/routes/emails.ts` |

### Compose & drafts
| Capability | Risk | Status | Real route |
|---|---|---|---|
| `mail.draft.create` | 1 | active | `POST /emails/` (compose) — `apps/quantmail/backend/routes/emails.ts` |
| `mail.draft.update` | 1 | active | `PUT /emails/:id` — `apps/quantmail/backend/routes/emails.ts` |
| `mail.draft.prepare` | 1 | preview | no distinct prepare endpoint yet |

### Delivery
| Capability | Risk | Status | Real route |
|---|---|---|---|
| `mail.send.prepare` | 1 | preview | queueing happens inline in the send path today |
| `mail.send.execute` | 3 | active | `POST /emails/:id/send` — `apps/quantmail/backend/routes/emails.ts` |

Side effects declare verification: `mail.message.sent.v1` must be observed —
an HTTP 200 before business verification is not final success. Degraded mode
is `queue`: when the mail service is unreachable the message is queued, never
silently dropped.

### Attachments
| Capability | Risk | Status | Real route |
|---|---|---|---|
| `mail.attachment.reference` | 0 | active | `GET /attachments/:id` — `apps/quantmail/backend/routes/attachments.ts` |

### Trust & safety
| Capability | Risk | Status | Real route |
|---|---|---|---|
| `mail.security.report` | 2 | preview | no dedicated report endpoint verified yet |

## Risk classification

| Capability | Default risk |
|---|---|
| thread.get / thread.search / attachment.reference | 0 |
| draft.create / draft.update / draft.prepare / send.prepare | 1 |
| thread.archive / thread.restore / security.report | 2 |
| send.execute | 3 |

Tier 3 requires user confirmation by default unless a durable user policy
explicitly authorizes it. Idempotency keys are required for all commands —
sends never execute twice.

## Required capability metadata

Every capability implementation MUST declare:

- stable name
- semantic version
- input schema
- output schema
- caller types
- tenant scope
- resource scope
- required permissions (scopes)
- risk tier
- approval requirement
- idempotency behavior
- timeout
- cost/credit behavior if metered
- audit event
- verification event
- degraded behavior
- rollback/undo behavior where possible

## Quanty restriction

Quanty receives a policy-filtered projection of these capabilities
(`projectForQuanty`). It must never receive direct Prisma/database access as
a substitute for capability execution.

## Cross-app rule

A capability may accept `QuantResourceRef` values from another product, but
QuantMail remains authoritative for mailbox data and authorization is
re-evaluated when the resource is resolved.
