# QuantMail backend — Retro-spec'd extra domains (K15)

Un-specced backend surfaces verified real on `origin/main` @ `e1fcc6b2` and kept.
Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B10).

## Route domains

| Domain (route file) | Contract | Notes |
|---|---|---|
| `ai-devtools.ts` | code-review, commit-message, pr-description, ci-fix, code-search, security-scan | Real services (`ai-commit-message.service`, `ai-pr-description.service`, …). **Consolidate with ci-healing paths** — do not let a second CI-fix implementation drift. |
| `e2ee.ts` + `lib/e2ee-relay.ts` | E2EE ciphertext relay seam for `@quant/encryption` (per-app lane) | Transports ciphertext only; never sees plaintext. `08` covers encryption, not this relay — now recorded. |
| `workspaces.ts` | Workspaces CRUD + invites | Backs `/workspaces` UI. |
| `contact-groups.ts` | Telegram-style contact groups | Complements `people-api.md` (participant context). |
| `email-templates.ts` | Templates CRUD + render | — |
| `quanty-mcp.ts` | Quanty MCP connections | Per `06-ai-quanty-platform.md`. |
| `dav.ts` (+ `/.well-known/caldav\|carddav`) | CalDAV/CardDAV protocol servers | 588-line real implementation; interop surface for a mail provider. |
| `ai-services.ts` (`/infra/*`) | aliases, disposable addresses, strip-trackers, pgp, undo-send job API | Mail utilities; undo-send backs the 30s undo feature. |
| AI mail-intelligence endpoints | triage, followup, unsubscribe, send-time, style analyze/draft, attachment-summary | Extend the quanty tool contract (`06`) with these tools; do not leave them as undocumented shadow APIs. |

## Structure-flagged modules (kept, relocation tracked by structure track)

| Module | Status per related decisions |
|---|---|
| `modules/company/` (agent-workforce) | Real, but company-plane code in the mail backend. Relocation tracked by structure track (K14 shape). |
| `modules/billing/` | Already a compat shim over `@quant/credits` per `decisions/economy-single-ownership.md` (K11). Relocation tracked. |
| `modules/code/` (git hosting) | Real git hosting; mail owns git *integration*, not hosting. Relocation tracked. |

## Mail-provider services (kept, spec'd retroactively)

- `services/imap-server` — serves IMAP to clients (`imap-sync.md` is the client-side spec; this is the server side).
- `services/smtp-submission` — RFC 6409 client-submission daemon.
