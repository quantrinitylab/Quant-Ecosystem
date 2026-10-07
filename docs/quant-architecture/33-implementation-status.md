# 33 — Implementation Status (Living Scoreboard)

## What this document is

This is the living scoreboard for the QuantEcosystem architecture. For every spec'd
module — every screen module (M/C/A/G/W/T/X/K/D IDs), every backend domain, every
cross-cutting platform contract — it records what is **real** versus what is
**missing, partial, or broken** in the code, with file-path evidence.

It is regenerated from the audit loops. Edit it by hand only to correct facts —
never mark anything done without evidence, per `15-definition-of-done.md`
(a screenshot, HTTP 200, or green TypeScript check is not done).

- **Last updated:** 2026-10-08 IST
- **Audit sources (read-only, not re-run here):**
  - `hidden_files/gap-audit/uiux-gap.md` — 115 spec'd screens, repo @ `abfb2b3` (2026-10-07)
  - `hidden_files/gap-audit/backend-gap.md` — 45 backend domains, repo @ `abfb2b35258bb765c11a34e660cb588cea2d58a3` (merge PR #568, 2026-10-07)
  - `hidden_files/gap-audit/structure-gap.md` — repo tree vs target, repo @ `abfb2b3` (2026-10-07)
  - `hidden_files/gap-audit/deepdive.md` — fake-data/security deep dive, repo @ `abfb2b3` (2026-10-07)
  - `hidden_files/gap-audit/extras-to-remove.md` — merged extras register (2026-10-07)
- **Scoreboard HEAD:** `6b8e75db` (merge PR #577). Statuses below reflect the audits above;
  remediation in flight (fake-removal + structural-khami waves, PR-only) is noted where known,
  not assumed.
- **File numbering note:** `29-` through `32-` were taken by the M39–M41 extension docs, so this
  scoreboard takes `33-`.

### Status legend (same as the audits)

- **BUILT** — implemented per spec with evidence.
- **PARTIAL** — exists but missing spec'd behaviors/states.
- **MISSING** — spec'd, no code.
- **BROKEN** — code exists but contradicts the spec or fails closed/open incorrectly.

### Headline counts

| Track | BUILT | PARTIAL | MISSING | BROKEN |
|---|---|---|---|---|
| Screens (115 across 9 products) | 69 | 15 | 31 | 0 |
| Backend domains (45) | 2 | 32 | 9 | 2 |
| Deep-dive severities | — | — | — | 17 P0 / 12 P1 / 10 P2 |
| Structure | — | — | 10 misplaced, 10 duplicates, 3 confirmed dead | 5 boundary violations |
| Extras (shipped, no spec) | — | — | — | 70+ UI routes, ~60 extra backend route files |

---

## 1. QuantMail — screens (spec: M01–M20, `12-screen-inventory.md`)

Per-screen deep specs exist in `products/quantmail/{screens,desktop,mobile,web}/` (M01–M16),
`security/` (15 files), `testing/` (16 files).

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| M01 | Inbox | BUILT | `apps/quantmail/src/app/page.tsx` (3,950 lines): `useInbox` API hook, cursor pagination, virtualizer, `Skeleton`/`InboxZeroState`, swipe actions, pull-to-refresh, keyboard nav, smart replies | — |
| M02 | Thread | BUILT | `apps/quantmail/src/app/thread/[id]/page.tsx` → `components/ConversationalThreadView.tsx`; optimistic mutations, edge-swipe back | — |
| M03 | Compose | BUILT | `apps/quantmail/src/app/compose/page.tsx` + `components/DockedComposer.tsx` | — |
| M04 | Search | BUILT | `apps/quantmail/src/app/search/page.tsx`, `hooks/useSearchEmails` | — |
| M05 | Mailbox | BUILT | `app/archive\|sent\|drafts\|spam\|trash\|starred\|snoozed\|labels/page.tsx` | — |
| M06 | Attachments | BUILT | `app/drive/doc/[docId]/page.tsx` (file preview) | — |
| M07 | Contacts | BUILT | `app/contacts/page.tsx` (1,200 lines) | — |
| M08 | Calendar Day | BUILT | `app/calendar/page.tsx` (1,244 lines) | — |
| M09 | Calendar Event | PARTIAL | Only public `app/calendar/booking/[slug]/page.tsx` (booking flow for outsiders) | No in-app event-detail screen |
| M10 | Drive Browser | BUILT | `app/drive/page.tsx` (1,835 lines) | — |
| M11 | File Preview | BUILT | `app/drive/doc/[docId]/page.tsx` | — |
| M12 | QuantGit Repository | BUILT | `app/quantgit/page.tsx` (2,576 lines) + `agentlab/`, `repositories/`; mock datasets have zero production importers (honest empty states) | — |
| M13 | Universal Search | PARTIAL | `app/search/page.tsx` (mail search) | Cross-app "universal" search unverified |
| M14 | Quanty | BUILT | `components/QuantyLiveAgent/`, `QuantyLauncher.tsx`, `QuantyCopilotDrawer.tsx` (overlay surfaces; inventory lists it as a screen) | — |
| M15 | Notifications | PARTIAL | `components/NotificationBell.tsx` + `app/api/notifications` + `hooks/useDesktopNotifications.ts` | No dedicated notifications center |
| M16 | Settings | BUILT | `app/settings/page.tsx` (1,082 lines) + `MailFiltersSettings.tsx`, `VacationResponderSettings.tsx`; honest "not end-to-end encrypted" copy at `settings/page.tsx:915-919` | — |
| M17 | Security | BUILT | `app/security/page.tsx` (847 lines) | — |
| M18 | Admin Home | BUILT | `app/admin/page.tsx` (230 lines): KPI cards + service status; honest "awaiting/unavailable" when backend has no data | — |
| M19 | Admin Domains | MISSING | No domains route in `apps/quantmail/src/app/` | Whole module missing |
| M20 | Admin DLP/Audit | MISSING | No DLP/audit route in `apps/quantmail/src/app/` | Whole module missing |

**Known P0 fakes attached to the app surface (extras, not M-screens — in remediation):**
`?tab=teams` (`MailTeamsCollaborationPanel.tsx` — fabricated teammates/PRs/deploys, deepdive §B),
`?tab=agents` (`MailSwarmAgentAccessPanel.tsx` — fabricated agent fleet/heartbeats/kubectl output, deepdive §B).
Unprovable copy: login screen "End-to-end encrypted" (`AuthBrandPanel.tsx:61-63`) contradicts settings page;
"End-to-End Encrypted Scheduling" on booking page (`calendar/booking/[slug]/page.tsx:501`) with zero booking crypto.

## 2. QuantChat — screens (spec: C01–C13, inventory one-liners only; no per-screen spec docs)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| C01 | Inbox | BUILT | `app/page.tsx`: `useConversations`, `useChatSocket`, presence, pinned/archived, error/empty states | — |
| C02 | 1:1 | BUILT | `app/chat/[id]/page.tsx` (1,363 lines): socket realtime, typing indicators, delivery/read ticks | Send path is plaintext; client E2EE engine (`e2eeClient.ts`) has zero UI callers — contradicts "we cannot read your messages" copy (`support/page.tsx:24`) |
| C03 | Group | BUILT | Same `chat/[id]` surface resolves group names/participants | — |
| C04 | Community | MISSING | No community route or component | Whole module missing |
| C05 | Channel | BUILT | `app/channels/page.tsx` (360 lines) | — |
| C06 | Media | BUILT | `app/camera/page.tsx` | — |
| C07 | Call | BUILT | `app/call/page.tsx` (381 lines) | — |
| C08 | Meeting | MISSING | No meeting route | Whole module missing |
| C09 | Search | MISSING | No conversation/message search (only contact picker inside `/new-chat`) | Whole module missing |
| C10 | Quanty | MISSING | Zero "quanty" references in `apps/quantchat/src` (excl. tests) | Whole module missing |
| C11 | Notifications | MISSING | No notifications screen | Whole module missing |
| C12 | Settings | PARTIAL | `app/profile/page.tsx` hub exists | No dedicated settings screen |
| C13 | Admin | MISSING | No admin route | Whole module missing |

**Spec drift note:** code ships a Snapchat-style bottom nav (Chats/Stories/Camera/Spotlight/Map) against a
messaging-app inventory. **Known P0 fake:** `/map` renders fabricated friends/locations (`app/map/page.tsx:51,106`,
`DEMO_FRIENDS`) — in remediation.

## 3. QuantAI — screens (spec: A01–A13, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| A01 | Chat | BUILT | `app/page.tsx` (1,474 lines): `ModelSelector`, streaming, voice toggle, artifacts | `/ask` is a duplicate chat surface (extra) |
| A02 | Model Picker | BUILT | `components/ModelSelector.tsx` | — |
| A03 | Artifacts | BUILT | `app/artifacts/page.tsx` (426 lines) | — |
| A04 | Agent Builder | PARTIAL | `WorkflowBuilder.tsx`, `AgentCodeTerminal.tsx`, `ToolCallCard.tsx` as components | No dedicated builder screen route |
| A05 | Agent Run | PARTIAL | `WorkflowDashboard.tsx`, `AgentDashboard.tsx`, `WorkflowProgressCard.tsx` | Run UX wiring as a screen unverified |
| A06 | Approval Queue | MISSING | No approval-queue screen | Whole module missing |
| A07 | Automations | PARTIAL | Workflow components exist | No `/automations` screen |
| A08 | Memory | PARTIAL | `MemoryDashboard.tsx`, `ProjectMemoryManager.tsx` as components | No dedicated memory screen route |
| A09 | Model Playground | MISSING | No playground screen | Whole module missing |
| A10 | Usage | PARTIAL | `UsageAnalyticsChart.tsx` + `/plan` page backed by `/api/quanty/plan`; honest "coming soon" when no checkout URL | Upgrade flow incomplete |
| A11 | Device Control | PARTIAL | `DeviceCard.tsx`, `DevicePreview.tsx`, `plan/DevicesSection.tsx` | No full device-control screen |
| A12 | Settings | BUILT | `app/settings/page.tsx` (248 lines) | — |
| A13 | Admin | MISSING | No admin route | Whole module missing |

**Known P0 fake AI surfaces (in remediation):** `/voice` (simulated listening + canned response + random XP,
`app/voice/page.tsx`), `/image-gen` (random progress → dead URL, `pages/image-gen.tsx:86-140`),
`/code` (hardcoded run outputs, `pages/code.tsx:283-299`), plus fake initial state in
`pages/translate|personas|device|plugins|models|ecosystem` (zero `fetch(`). Honest surfaces to preserve:
`/analytics`, `/connectors` (real fetches, loading/error states).

## 4. QuantGram — screens (spec: G01–G12, inventory one-liners only)

Branding drift: source headers say "QuantNeon" (`src/pages/index.tsx:2`) while the product is QuantGram.

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| G01 | Feed | BUILT | `src/pages/index.tsx` (392 lines): stories bar, `useFeed`, infinite scroll, skeleton/empty/error states | — |
| G02 | Stories | BUILT | `src/pages/stories.tsx` + `story-viewer.tsx` | — |
| G03 | Create | BUILT | `src/pages/create.tsx` | — |
| G04 | Camera/Editor | BUILT | `src/pages/camera.tsx` | — |
| G05 | Post Detail | BUILT | `src/pages/post/[id].tsx` | — |
| G06 | Profile | BUILT | `src/pages/profile/[id].tsx` | Fabrication issues (see P0s): fake default accounts/highlights, formula views `(likes)*4+120`, fake Unsplash media injected into real posts (`ProfileView.tsx:124-175,503,507,835`) |
| G07 | Explore | BUILT | `src/pages/explore.tsx` | — |
| G08 | Reels | BUILT | `src/pages/reels.tsx` | Comments always fake (`ReelsCommentsSheet.tsx:36,82` `MOCK_COMMENTS` as default prop) |
| G09 | Messages Handoff | BUILT | `src/pages/messages.tsx` | — |
| G10 | Notifications | BUILT | `src/pages/notifications.tsx` | — |
| G11 | Creator Analytics | MISSING | Only `src/hooks/useAnalytics.ts`; no analytics page | Whole module missing |
| G12 | Admin | MISSING | No admin page | Whole module missing |

**Known P0 fakes (in remediation):** collab invites (`CollabInvite.tsx:34-56`, zero network calls),
social map (`SocialMapView.tsx:22` `INITIAL_MAP_PINS`), `guides`/`broadcast`/`notes` (100% mock).
Honest: `shopping.tsx` fetches real `/api/shopping/*`.

## 5. QuantWave — screens (spec: W01–W10, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| W01 | Home | BUILT | `app/page.tsx` (451 lines), react-query feed | — |
| W02 | Thread | MISSING | No thread/post-detail route; waves link only to `/compose?space=…` | Waves cannot be opened |
| W03 | Compose | BUILT | `app/compose/page.tsx` | — |
| W04 | Communities | BUILT | `app/communities/page.tsx` | — |
| W05 | Explore/Trends | BUILT | `app/trending/page.tsx` | — |
| W06 | Profile | BUILT | `app/profile/page.tsx` | — |
| W07 | Search | MISSING | No search route | Whole module missing |
| W08 | Notifications | BUILT | `app/notifications/page.tsx` | — |
| W09 | Report | MISSING | No report flow | Whole module missing |
| W10 | Admin | MISSING | No admin route | Whole module missing |

**Known P0 security hole (in remediation):** `apps/quantwave/backend/routes/radar.ts:22-31`
`requireUserId` trusts client `x-user-id` header → full user impersonation on `/radar/swipe` and
`/radar/nearby`. Honest: `follow.service.ts:205` who-to-follow is real Prisma friends-of-friends.

## 6. QuanTube — screens (spec: T01–T13, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| T01 | Home | BUILT | `src/pages/index.tsx` (328 lines), paginated feed | — |
| T02 | Watch | BUILT | `src/pages/watch/[id].tsx` (674 lines): player, chapters, quality, comments, recommendations | — |
| T03 | Shorts | BUILT | `src/pages/shorts.tsx` (606 lines) | — |
| T04 | Music | PARTIAL | `src/pages/music.tsx` (778 lines) but "Lyrics sync coming soon..." (`music.tsx:667`); mock artist catalog (see P0) | Lyrics + catalog |
| T05 | Search | BUILT | `src/pages/search.tsx` (393 lines) | Fully fake results (see P0) |
| T06 | Channel | BUILT | `src/pages/channel/[id].tsx` (631 lines) | Errors masked with fake channel (see P0) |
| T07 | Upload | BUILT | `src/pages/upload.tsx` (763 lines) | Progress fake; files never upload (see P1) |
| T08 | Studio | BUILT | `src/pages/studio.tsx` (541 lines) | — |
| T09 | Live | BUILT | `src/pages/live.tsx` (305 lines) | Metrics simulated (see P0) |
| T10 | Library | BUILT | `src/pages/library.tsx` (501 lines): History/Playlists/Watch-Later real | Downloads tab still local-mock (P2) |
| T11 | Premium | PARTIAL | `src/pages/premium.tsx`: honest "Coming Soon", never collects cards (`premium.tsx:207`) | Subscriptions not available |
| T12 | Creator Analytics | PARTIAL | `src/pages/monetization.tsx` (233 lines) | Full analytics unverified |
| T13 | Admin | MISSING | No admin page | Whole module missing |

**Known P0 fakes (in remediation):** fabricated live chat + fake $50 donations
(`LiveStreamChat.tsx:48-105`), simulated viewer/bitrate/fps/latency (`useLiveStream.ts:161-188`),
100% fake search (`search.tsx:103-105`), theatrical transcoding (`TranscodingProgress.tsx:64-78`),
entirely mock music product (`music.tsx:256-267`), error masking with fake "TechVision" channel
(`channel/[id].tsx:199`), fake upload progress (`VideoUploader.tsx:63-78`, stalls at "processing").
Honest: SAMPLE-badge labeling (`public-videos.ts`, `pages/index.tsx:281`).

## 7. QuantMax — screens (spec: X01–X10, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| X01 | Discovery | BUILT | `src/pages/discover.tsx`: category tabs, `discover.service` | — |
| X02 | Short Video | BUILT | `src/pages/index.tsx` (385 lines): ForYou/Following swipe feed | — |
| X03 | People Discovery | BUILT | `src/pages/nearby.tsx` | — |
| X04 | Match | BUILT | `src/pages/matches.tsx` + `matching.tsx` | — |
| X05 | Chat Handoff | MISSING | No chat-handoff page | Whole module missing |
| X06 | Live | BUILT | `src/pages/live.tsx` | — |
| X07 | Profile | BUILT | `src/pages/profile.tsx` | — |
| X08 | Safety | MISSING | No safety screen | Whole module missing |
| X09 | Preferences | PARTIAL | Preferences inside `profile.tsx` | No dedicated screen |
| X10 | Admin | MISSING | No admin page | Whole module missing |

No fake-data hits in production paths; `speed-dating`/`virtual-dates` are honest placeholders.

## 8. QuantCooks — screens (spec: K01–K12, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| K01 | Home | BUILT | `src/pages/index.tsx` (540 lines) | — |
| K02 | Projects | BUILT | `src/pages/projects.tsx` (274 lines), `useProjects` | — |
| K03 | Editor | BUILT | `src/pages/editor.tsx` (703 lines), `useProjectById` | — |
| K04 | Timeline | BUILT | `src/pages/canvas.tsx` (949 lines) | — |
| K05 | Assets | BUILT | `src/pages/assets.tsx` (353 lines) | — |
| K06 | AI Generation | MISSING | No AI-generation UI in `src` | Product's core loop missing |
| K07 | Render Queue | MISSING | No render queue | Product's core loop missing |
| K08 | Preview/Export | BUILT | `src/pages/export.tsx` (699 lines); polls real `GET /api/exports/[id]/status` | — |
| K09 | Templates | BUILT | `src/pages/templates.tsx` (288 lines) | — |
| K10 | Marketplace | MISSING | No marketplace page | Whole module missing |
| K11 | Creator | PARTIAL | `src/pages/projects-gallery.tsx` (248 lines) | Creator portal unverified |
| K12 | Admin | MISSING | No admin page | Whole module missing |

No live fake-data hits (AITools gating + export polling verified honest).

## 9. QuantAds — screens (spec: D01–D12, inventory one-liners only)

| ID | Module | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| D01 | Advertiser Home | BUILT | `app/page.tsx` (166 lines): metric cards + campaign rows | — |
| D02 | Campaigns | BUILT | `app/campaigns/page.tsx` (232 lines): pause/delete/edit | — |
| D03 | Campaign Builder | MISSING | No `/campaigns/[id]` or builder route; `onEdit` has no destination | Edit action is a dead end |
| D04 | Creative | BUILT | `app/creatives/page.tsx` (126 lines) | — |
| D05 | Audience | BUILT | `app/audiences/page.tsx` (128 lines) | — |
| D06 | Auction/Bid | MISSING | No route | Whole module missing |
| D07 | Billing | BUILT | `app/billing/page.tsx` (181 lines) | — |
| D08 | Analytics | BUILT | `app/analytics/page.tsx` (221 lines) | — |
| D09 | Attribution | MISSING | No route | Whole module missing |
| D10 | Fraud/Review | MISSING | No route | Whole module missing |
| D11 | Payouts | MISSING | No route | Whole module missing |
| D12 | Admin | MISSING | No route | Whole module missing |

Economy surfaces (`/economy`, `/wallet`, `/store`, `/boost`, `/creator`, `/subscriptions`) fetch real
endpoints with honest "coming soon" gating — real balances only, no mock data.

## 10. Extension modules M21–M41 (doc specs; implementation not yet graded)

The `12-screen-inventory.md` lists only M01–M20, so these architecture/design extension docs have no
inventory backing (doc fix needed: extend the inventory or fold these into it).

| Module | Doc | Implementation status |
|---|---|---|
| M21 Privacy | `20-m21-privacy.md` | Not graded — no per-screen inventory; backend has partial privacy primitives (tracking-pixel stripper, DMARC evaluation) |
| M22 Globalization | `21-m22-globalization.md` | Not graded |
| M23 Developer Platform | `22-m23-developer-platform.md` | Not graded — related unspec'd code exists (`quanty-mcp.ts`, `ai-devtools.ts`, CalDAV) |
| M24 Enterprise | `23-m24-enterprise.md` | Not graded |
| M25 Compliance & Trust | `24-m25-compliance-trust.md` | Not graded — trust domain is PARTIAL (see backend §2.3) |
| M26–M35 | — | **No docs exist** (numbering jumps 24→26); inventory gap |
| M36 Workspace UIUX Foundation | `26-m36-quantmail-workspace-uiux-foundation.md` | Not graded |
| M37 QuantMail Complete UIUX | `27-m37-quantmail-complete-uiux.md`, `27-m37-quantmail-uiux-map.md` | Not graded |
| M38 QuantCalendar Complete UIUX | `28-m38-quantcalendar-complete-uiux.md`, `28-m38-quantcalendar-uiux-map.md` | Not graded |
| M39 QuantDrive Complete UIUX | `29-m39-quantdrive-complete-uiux.md`, `29-m39-quantdrive-uiux-map.md` | Not graded |
| M40 QuantDrive Memory | `30-quantdrive-memory-architecture.md` | Not graded |
| M41 Quant Memory + Cross-Product Agents | `31-quant-memory-intelligence-v2.md`, `32-quant-memory-cross-product-agent-system.md` | Not graded |

---

## 11. QuantMail — backend domains (spec: `products/quantmail/backend/`, 41 domains)

Source: `backend-gap.md` (repo @ `abfb2b35258bb765c11a34e660cb588cea2d58a3`). Status key:
BUILT / PARTIAL / MISSING / BROKEN as in the header.

### 11a. Inbox / Compose / Thread

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Inbox API | `api.md` | PARTIAL | `GET /emails`, `GET /threads`, `GET /emails/changes`; thread commands (archive/restore/delete/read/unread/star/labels) in `routes/emails.ts:810-1466`, `routes/threads.ts` | No `expectedVersion` / `THREAD_VERSION_CONFLICT` (zero hits repo-wide); no `requestId` in responses; no idempotency keys on retryable mutations |
| Compose | `compose-api.md`, `compose-domain.md`, `compose-data-model.md` | PARTIAL | Draft create/update/send/delete; undo-send 30s window | No `mail.draft.prepare_send` two-phase flow / preparation token / `confirmation`; no `SEND_ALREADY_ACCEPTED` / `PREPARATION_EXPIRED` / `DRAFT_VERSION_CONFLICT`; no `idempotencyKey` on update/send |
| Thread | `thread-api.md`, `thread-domain.md`, `thread-data-model.md`, `threading-message-id.md` | PARTIAL | Thread get/list/mute/unmute/read; In-Reply-To/References stitching (`thread.service.ts`, `email.service.ts` `stitchInbound`) | No `mail.message.get_body` with `safe_html`/`text` representations (raw body); no `mail.thread.create_calendar_event` / `mail.thread.save_attachment_to_drive`; no `ATTACHMENT_NOT_AVAILABLE` / `SECURITY_BLOCKED` typed errors |

### 11b. Delivery pipeline (M13)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Delivery API/domain | `delivery-api.md`, `delivery-domain.md`, `delivery-data-model.md`, `delivery-events.md`, `delivery-rate-abuse.md` | PARTIAL | BullMQ `outbound-delivery` queue (`outbound-delivery.service.ts:25`); `DeliveryWorker` DKIM-signs, resolves MX, transmits SMTP, per-recipient `DeliveryAttempt` rows (`schema.prisma:3310`), state machine `draft→queued→deferred→sent→{bounced,delivered}`; fails closed without DKIM keys (`worker.ts:13-16`); suppression pruning | No `mail.send.prepare`/`confirm`/`status`/`cancel`; no `mail.delivery.get`/`events`; **zero** `mail.outbound.*.v1` events emitted; state vocabulary diverges (`SUBMITTED`/`CANCELLED`/`FAILED` absent); **no per-user/per-domain/org sending limits**; no provider health-check endpoint |
| SMTP outbound | `smtp-outbound.md` | PARTIAL | `SmtpTransport` provider abstraction; `classifySmtpCode`; single queue owner (no double-send); SES fallback | No deterministic idempotency key on outbound message; bounded-exponential-backoff-with-jitter retry config not evidenced in worker options |
| SMTP inbound | `smtp-inbound.md` | PARTIAL | `services/smtp-inbound` → webhook → `InboundIngestAdapter`: DMARC/SPF/DKIM evaluation, spam classification, thread stitching, Message-ID dedup | SPF/DKIM/DMARC evaluated only in backend, not at SMTP edge; no TLS-policy / connection-rate checks in the edge service |
| IMAP sync | `imap-sync.md` | PARTIAL | One-shot import (`ImapImporterService`, `POST /emails/import/imap`, `GET /emails/import/imap/status/:jobId`) | No UIDVALIDITY/last-UID cursors, incremental sync, reconnect/recovery, `mail.imap.sync_status` |
| Bounce & complaint | `bounce-complaint.md` | BUILT | SES SNS webhook (`routes/inbound-webhook.ts:527-601`): permanent bounce → suppression, complaint → suppression; 422 `RECIPIENT_SUPPRESSED` at send time | — |
| Queue reliability | `queue-reliability.md` | PARTIAL | Durable BullMQ queues; DLQ support in `@quant/queue` (`packages/queue/src/dead-letter.ts`) | No queue depth/age observability endpoint; no replay tooling; bounded-retry policy on mail queues not evidenced |
| Mail authentication | `authentication-mail.md` | PARTIAL | DKIM key provisioning + signing in controlled outbound boundary; DMARC aggregate-report ingest (`POST /deliverability/dmarc-reports`); `GET /deliverability/stats`; private keys out of logs/API | — |

### 11c. Trust & safety (M14)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Trust API/domain | `trust-api.md`, `trust-domain.md`, `trust-events.md`, `trust-data-model.md`, `trust-feedback.md` | PARTIAL | `POST /emails/:id/detect-phishing`, `GET /emails/:id/reply-suggestions`; AI security scan service; inbound spam/phishing signals | All five spec'd user APIs missing (`mail.security.get_message_assessment`, `get_sender_assessment`, `report`, `release_quarantine`, `mark_not_spam`); all five admin APIs; `security_assessments` / `reputation_subjects` / `quarantine_items` / `security_reports` tables absent; all `mail.security.*.v1` events absent |
| Abuse engine | `abuse-engine.md` | PARTIAL | Rate-limit middleware; suppression lists | Rate limiter is **in-memory** (`middleware/rate-limit.ts:9` — broken across replicas); no warn / step-up-auth / restrict-sending / temporary-block / escalate actions; no recovery/review paths; no velocity signals |
| Quarantine | `quarantine.md` | PARTIAL | DMARC-fail → spam-folder routing (`InboundIngestAdapter.shouldQuarantine`, `inbound-ingest.service.ts:257-331`) | No `QUARANTINED/REVIEWABLE/RELEASED/EXPIRED/DELETED` state machine; no idempotent release command; no quarantine list/release API |
| Phishing/URL intel | `phishing-url.md` | PARTIAL | Tracking-pixel stripper (`tracking-pixel-stripper.service.ts`); AI security scan | No isolated URL-inspection sandbox (network-restricted, timeouts/redirect limits) |
| Attachment security | `attachment-security.md` | PARTIAL | Upload → type/size validation → malware scan → block infected (`routes/attachments.ts:156-168`, `attachment-scanner.service.ts`); scanned-proxy download | No inbound attachment scanning before inbox delivery (only SES-path verdicts); no scan-result versioning/expiry; no sandbox |

### 11d. Search (M12)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Search | `search-api.md`, `search-api-production.md`, `search-domain.md`, `search-index.md`, `search-ranking.md`, `search-semantic.md`, `search-production.md`, `search-events.md` | PARTIAL | `GET /search/emails\|drive\|documents\|all\|parse`; Gmail-style query parser; PG GIN full-text/trigram indexes (`search-query.service.ts:255-257`, migration 0067) | Response lacks `domainStatus`, `indexFreshness`, `rankingReason`, opaque `cursor`; **outbox→CDC→projection→index pipeline dead** (backend writes no outbox rows); backend search bypasses Meilisearch/Qdrant entirely (infra deploys both, code never queries them); event names don't match spec; no reindex/repair API; no per-domain failure isolation |

### 11e. Context domains

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| People | `people-api.md`, `people-context.md`, `people-events.md` | PARTIAL | Contacts CRUD + search/frequent/directory/import(vcard/csv/imap)/export/dedup/merge (16 routes); `GET /ai/contact-context/:email` | No spec'd `mail.participant.context` contract shape; no `create_contact_intent` / `attach_contact` workflow commands; no `contacts.contact.*.v1` consumption |
| Calendar | `calendar-api.md`, `calendar-context.md`, `calendar-events.md` | PARTIAL | Full CRUD + RSVP + ICS import/export + booking links + CalDAV/CardDAV protocol server (31 routes, `routes/dav.ts`) | No `mail.thread.calendar_context` query; no `calendar.event.*.v1` consumption |
| Drive | `drive-api.md`, `drive-context.md`, `drive-events.md` | PARTIAL | 43 routes: quota, shares, versions, trash/restore/purge, chunked + multipart uploads, thumbnails | No `mail.attachment.prepare_download` (short-lived scoped capability), `prepare_preview` gating, `mail.attachment.save_to_drive` orchestration |
| Quanty | `quanty-api.md`, `quanty-data-model.md`, `quanty-runtime.md` (+ `products/quantmail/quanty-*.md`) | PARTIAL | Task API: create/get/stream/interrupt/confirm/undo, approvals/activity/schedule/browser-tasks/identity/status (13 routes); `AgentSession` model (`schema.prisma:2033`); AI mail tools as REST mapping to spec'd tool names | No spec session API (`quanty.session.create/message/get`); `quanty.approval.respond` lacks **scoped expiring approval tokens** (bare boolean); `AgentTask`/`AgentStep`/`Approval`/`VerificationRecord`/`MemoryCandidate` tables absent; tools bypass the agent runtime's policy/approval layer (direct REST; spec: every tool declares risk class, idempotency, verification method) |

### 11f. Settings / attention / admin / audit

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Settings | `settings-api.md`, `settings-domain.md`, `settings-events.md`, `settings-data-model.md` | MISSING | Only `POST/GET/DELETE /settings/tokens` (external API tokens) | No `settings.catalog` / `settings.get` / `settings.update` (no versioned federated settings); no `devices.list`/`revoke`; no `sessions.list`/`revoke`/`revoke_all`; no `mail.settings.updated.v1` |
| Attention | `attention-api.md`, `attention-domain.md`, `attention-events.md` | PARTIAL | `GET /notifications`, `POST /notifications/read-all`, `PATCH /:id/read`, `DELETE` | No `markUnread`, `resolve`, `dismiss`, `bulkMarkRead`, `preferences.get/update` (channels/quiet hours/batching), `delivery.register/revoke`, server deep links, all `attention.*.v1` events |
| Admin | `admin-api.md`, `admin-domain.md`, `admin-events.md` | PARTIAL | 4 read-only GETs with staff-role gate (`admin.ts`) | Every mutation missing: `admin.mail.domains.create/update/verify`, `mailboxes.suspend/restore`, `aliases.*`, `groups.*`, `policies.*`, `retention.*`, `quotas.*`, `audit.list`; no `mail.*.v1` admin events |
| Audit lifecycle | `audit-lifecycle.md` | BROKEN | `AuditLog` model + `AuditService` + `GET/POST /audit-logs` exist | **`POST /audit-logs/` lets any authenticated client write arbitrary audit records** (`routes/audit-logs.ts:111-141`), while **server-side mutations never write audit records** (only the POST handler + quanty git-tools write). Contradicts spec: "Audit records are append-oriented and protected from ordinary product mutation" |

### 11g. Data lifecycle & compliance (M15)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Retention | `retention.md` | PARTIAL | `RetentionService` + `GET/POST /retention/policies`, legal-holds CRUD | No retention **workers** identifying eligible records (no scheduled job); no cascade to derived systems (search/vector/caches); no per-data-class independent periods |
| Holds | `holds.md` | PARTIAL | Hold place/list/release/check API; deletion path honors holds (`routes/emails.ts:1311-1316`) | Falls back to **in-memory** hold store (`memoryLegalHolds`) when Prisma model absent; scope is custodian-email only, not spec's user/mailbox/thread/message/date-range/data-class scopes |
| Deletion | `deletion.md` | MISSING | — | No deletion state machine (`DELETE_REQUESTED→VALIDATING→SCHEDULED→ERASING→VERIFIED`); no deletion workers/jobs; no verification across search/vector/caches/object storage |
| Export | `export.md` | MISSING | Only contact vcard/csv and single-document export | No async export lifecycle (`REQUESTED→AUTHORIZING→PREPARING→READY→EXPIRED`); no manifest; no short-lived download capability |
| Backup/restore | `backup-restore.md` | PARTIAL | `createSnapshot` (`backup-snapshot.service.ts`); `infra/k8s/backup-schedule.yaml` | No encrypted/versioned/integrity-checked/tested-restore properties; no restore workflow (isolated env → validate → reconcile → cutover) |
| Data lifecycle | `data-lifecycle-domain.md`, `derived-data-lifecycle.md` | PARTIAL | Soft-delete (`deletedAt`) on mail | No lifecycle coordinator; no derived-data invalidation on source deletion (nothing emits it) |
| Lifecycle events | `lifecycle-events.md` | MISSING | — | Zero `data.export.*` / `data.deletion.*` / `data.retention.*` / `data.hold.*` events |

### 11h. Reliability & ops (M16)

| Domain | Spec ref | Status | Evidence | Gaps vs spec |
|---|---|---|---|---|
| Degraded modes | `degraded-modes.md` | PARTIAL | Outbound queues when busy; honest 202/503s; health never fabricates | No declared per-dependency degraded behaviors; no search-unavailable reporting; no "fail closed for mutations" enforcement when Postgres degraded |
| Health/dependencies | `health-dependencies.md` | PARTIAL | `/health`, `/api/health/detailed` (real Postgres probe) | 10/12 spec'd dependencies untracked; no latency/error-rate/timeout-rate/circuit-state/last-success per dep |
| Observability | `observability.md` | PARTIAL | Structured pino logs, request-id plugin, metrics plugin, OTel seam; privacy rule honored (no bodies/tokens in logs) | Per-dep health + SLOs missing |
| Reliability events | `reliability-events.md` | MISSING | — | Zero `reliability.*.v1` events |
| SRE SLOs | `sre-slos.md` | MISSING | — | No SLO definitions, availability/latency targets, or error budgets |
| Incident response | `incident-response.md` | MISSING | — | No incident records, commander assignment, or review artifacts |
| Runbooks | `runbooks.md` | MISSING | — | None of the 14 required runbooks in repo |
| DR / RPO-RTO | `dr-rpo-rto.md` | MISSING | — | No RPO/RTO definitions per data class or journey; no DR-mode runbooks |
| Inbox-mutation workflow | `workflows/inbox-mutation.md` | BROKEN | Archive handler (`routes/emails.ts:810-828`) | No `expectedVersion` (step 5), no transaction (step 6), no outbox append (step 7), no event publish (steps 10–11), no audit (step 14), no `requestId`; concurrent edits silently overwrite (spec: `THREAD_VERSION_CONFLICT`). Same pattern across all mail mutations |
| Domain map / projections | `domain-map.md` | PARTIAL | Ownership boundaries respected in code | `mail_thread_list` / `mail_unread_counts` / `mail_folder_counts` / `mail_label_counts` projections computed live via Prisma; no projection rebuild path |

**Backend totals: BUILT 2 (bounce-complaint; identity/auth-08) · PARTIAL 32 · MISSING 9 · BROKEN 2 = 45.**

---

## 12. Cross-cutting scoreboard (platform contracts)

| Contract | Spec | Status | Evidence | Gap |
|---|---|---|---|---|
| Outbox / event spine | `05-data-and-event-architecture.md`: "write domain state and outbox record in one transaction; publish asynchronously" | BROKEN (infra BUILT, producers MISSING) | `outbox_events` table (`schema.prisma:1474`), `OutboxPublisher` (`packages/data-plane/src/outbox.ts`), `services/cdc-relay` poller, `services/search-indexer` consumer all exist | **Zero** outbox writes in `apps/quantmail/backend/` (only writer repo-wide: `apps/quantube/backend/services/video.service.ts:433`, non-spec event names); spec'd `mail.*.v1` sets never emitted; consumers starve. Real-time fan-out is direct Redis pubsub + synchronous cross-service calls instead |
| Economy ownership | `03-product-boundaries-and-domains.md`: "QuantTrinity owns economy policy only" | BROKEN | `packages/payments`, `packages/credits`, `packages/quant-economy`, `packages/creator-economy` (+ `quant-commerce`) all live with overlapping wallet/ledger/payout concepts | 4+ owners; plus `apps/quantmail/backend/modules/billing/` and `modules/company/org-budget-reservation.port.ts` inside the mail product backend |
| Platform adoption | `00-architecture-charter.md`: "platform owns reusable primitives; products may consume them but may not bypass them" | BROKEN (inverted) | 253 inline-`fetch()` bypasses of `@quant/api-client` (88 files, `scripts/inline-fetch-baseline.json`); 8 platform packages (`data-plane`, `cache`, `cdn`, `scaling`, `events`, `search`, `payment`, `recommendation`) have exactly one consumer (QuantAI); 8 apps carry byte-identical copy-pasted `src/mobile/` platform layers; 8 diverged `AuthGuard.tsx` copies | Charter rule inverted in practice |
| Idempotency | `15-definition-of-done.md` backend checklist | MISSING (platform-wide) | Only handful of services (`quantads` credits-wallet, creator-economy, quantchat call-record, quantai webhook-dispatcher) | No global `Idempotency-Key` middleware in `packages/server-core`; mail mutations have zero idempotency keys |
| SLOs / error budgets | `10-reliability-observability.md`, `sre-slos.md` | MISSING | — | No SLO definitions, availability/latency targets, error budgets, circuit breakers, or systematic remote-call timeouts anywhere |
| Auth: `?token=` bearer | Security baseline | BROKEN | `packages/server-core/src/plugins/auth.ts` `requireAuth()` falls back to `request.query['token']` | All nine backends accept tokens in query strings → tokens land in access logs, browser history, Referer headers. (In remediation — fake-removal wave S3) |
| Auth: SSO ticket "verification" | `08-identity-security-trust.md` | BROKEN | `packages/shared-ui/src/interconnection/UniversalSSOTokenBridge.ts:262-284` `verifyHandoffTicket()` base64-decodes only, checks `exp`, returns attacker-influenceable uid/email/name/tier | Unverified token presented as "verified"; drives client authenticated state in 5 apps' login flows. (In remediation — fake-removal wave S2) |
| Auth: impersonation | `08-identity-security-trust.md` | BROKEN | `apps/quantwave/backend/routes/radar.ts:22-31` trusts client `x-user-id` header | Full user impersonation on live `/radar/swipe`, `/radar/nearby`. (In remediation — fake-removal wave S1) |
| Auth: step-up | `settings-api.md`, `abuse-engine.md` | MISSING | Zero `step.up`/`stepUp` hits in routes/services | No step-up authentication anywhere |
| DeliveryWorker deployment | `delivery-domain.md` | BROKEN (code BUILT, deployment MISSING) | `apps/quantmail/backend/worker.ts` entrypoint correct (DKIM-sign → MX → SMTP, fails closed without `DomainAuthKey`) | **Zero** k8s/helm manifests reference it — queue fills, nothing drains it; external outbound mail cannot work on staging |

---

## 13. Khamiyan backlog — phase-mapped (per `14-build-order.md`)

Security P0s (radar impersonation, SSO ticket, `?token=`) are owned by the fake-removal wave.
What follows are the structural items, in build-order phase sequence.

### Phase 1 — platform kernel

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K1 | Outbox/event spine dead — mail backend writes zero outbox rows (§12) | backend-gap §1a | Deep agent: implement outbox writes in mail mutation paths + spec'd `mail.*.v1` emission. Unlocks ~10 downstream domains |
| K2 | `?token=` bearer acceptance (§12) | deepdive §C | Owned by fake-removal wave S3 — do not duplicate |
| K4 | No global idempotency middleware | backend-gap §1e, deepdive §C | Deep agent: `Idempotency-Key` middleware in `packages/server-core`, adopt on mutating routes |
| K5 | 253 inline-fetch bypasses of `@quant/api-client` | structure-gap §V1 | Deep agent(s): migrate app by app to the platform client |
| K6 | No step-up authentication | backend-gap §1b | Deep agent per `settings-api.md` / `abuse-engine.md` |
| K8 | Duplicate packages: two PrismaClient singletons; `payment`/`payments`; `recommendation`/`recommendations` | structure-gap §D1/D2/D5 | Deep agent: consolidate to one each (merge/deprecation plan) |
| K7 | Per-app `src/mobile/` copy-paste (8×); per-app `AuthGuard` (8×); dead `ErrorTracker`; unwired `packages/quant_flutter/` | structure-gap §M1/M2/D4/D7/X1/X2 | Deep agent: one `@quant/mobile-*` platform package; one auth guard; delete dead code |

### Phase 2 — QuantMail reference

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K9 | M19 Admin Domains + M20 Admin DLP/Audit missing | uiux-gap §1 | Deep agent: build per `products/quantmail` specs |
| K10 | M09/M13/M15 partial (event detail, universal search, notifications center) | uiux-gap §1 | Deep agent |
| K1b | Backend PARTIAL domains with highest value: outbox (K1), `expectedVersion`/`THREAD_VERSION_CONFLICT` + `requestId`, server-side audit writes + close client-writable `POST /audit-logs`, settings catalog + device/session management, trust/quarantine APIs + tables | backend-gap §2, §4 | Deep agents, spec order |

### Phase 4 — cross-product backbone

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K11 | Economy 4 owners → single ownership | structure-gap §D3, backend-gap §1c | Deep agent: single-ownership merge PR with migration plan (per `03`) |

### Phase 9/10 — reliability & scale

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K12 | No SLOs/error budgets/circuit breakers; 10/12 deps untracked | backend-gap §1d/§2.8 | Deep agent per `10-reliability-observability.md`, `sre-slos.md` |
| K13 | Remote-call timeouts not systematic | backend-gap §1d | Deep agent: timeout policy |

### Docs track (parallel, PR-only)

| ID | Khami | Source | Disposition |
|---|---|---|---|
| K14 | 8 products have only one-line inventories; 7 doc planes missing; numbering collisions (16–21, 27, 28); M26–M35 gap; `docs/` root sprawl (~35 ad-hoc files) | structure-gap §4, uiux-gap §A | Doc agents: per-screen deep specs for QuantChat/QuantAI/QuantGram/QuantWave/QuanTube/QuantMax/QuantCooks/QuantAds like `products/quantmail/`; fix numbering; map root sprawl to planes |
| K15 | Extras Part B: ~70 unspec'd UI routes + ~60 extra backend route files | extras-to-remove.md Part B | Per item: keep → retro-spec first; remove → separate PR per product. Fake-data clusters are P0 and stay in the fix queue |

---

## 14. Extras register — disposition

Source: `extras-to-remove.md` (2026-10-07). "Extra" = shipped in code/site but NOT covered by
`docs/quant-architecture/` specs. Disposition: **keep+spec** (write the spec first, then it stops
being an extra) or **remove** (PR per product).

### Part A — SAFE TO DELETE (dead, duplicated, or junk; zero live users verified)

| Item | Path | Disposition |
|---|---|---|
| Stray nested checkout dir (byte-identical doc) | `apps/quantmail/backend/Quant-Ecosystem/` | remove |
| Agent scratch at repo root (`AGENT_MEMORY.md` 3,906 lines, `GLOBAL.md`, `GOAL.md`, `khamiya.md`, `commit_msg_wave39.txt`, `test-msg.json`, `stryker.conf.mjs`, `build-and-push.*`, `deploy-agents.sh`, `apk testing/`, `android-project/`) | repo root | remove |
| One-off operator JSON blobs | `infra/mcp/` (~20 files) | remove |
| Scratch in scripts (`__pycache__`, task notes) | `scripts/` | remove |
| Dead `ErrorTracker` class (zero external users) | `packages/observability/src/core/error-tracker.ts` | remove |
| Unwired Dart workspace | `packages/quant_flutter/` | remove |
| Empty baseline | `scripts/dead-packages-baseline.json` | remove |
| Never-rendered legacy dataset | `apps/quantmail/src/components/DriveSubViews.tsx:1456` (`_sampleFeedItems`) | remove |
| Dead redirect shells | QuantMail `app/repos/`, `app/codehub/` | remove |
| Duplicate shop surfaces | QuantGram `/shop` + `/shopping` | remove (keep one) |
| Duplicate chat surface | QuantAI `/ask` | remove |
| ERP strays (invoices, crm-pipeline, seating-chart, ticket-checkin, price-book-quote, booking buffers, sms, external-sync, remote-file-ingest, agent-bus-mail-delivery) | `apps/quantmail/backend/` | remove (verify zero importers at PR time) |
| Phone OTP endpoints (auth overhaul removed phone login; these remain) | `apps/quantmail/backend/routes/phone.ts` | needs one product decision, then remove or keep+spec |
| In-memory federation (evaporates on restart) | `apps/quantmail/backend/routes/federation.ts` | remove or rebuild properly |

### Part B — NEEDS DISCUSSION (keep+spec vs remove; fake-data clusters are P0 in the fix queue)

| Area | Items | Lean |
|---|---|---|
| QuantMail UI | `/marketing`, `/postcards`, `/pipelines`, `/lab/*`, `/workspaces`, `/help`, `/privacy`, `/terms`, `/invite/*`, `/groups/join/*`, `/sso`, auth pages | keep+spec (mostly legitimate) |
| QuantChat UI | `/stories`, `/spotlight`, `/memories`, `/reels`, `/map` (P0 fake), `/camera`, `/new-chat`, `/profile`, `/privacy`, `/support`, `/terms`, `/login` | Snapchat paradigm is spec drift — product decision; `/map` fake is P0 regardless |
| QuantAI UI | `/feed`, `/goals`, `/ideas`, `/plan`, `/voice` (P0 fake), `/connectors`, `/profile`, `/ask` + gamification components + 13 fake `src/pages/` routes | P0 fakes in fix queue; rest keep+spec |
| QuantGram UI | `/games`, `/shop`, `/map`, `/notes`, `/collab`, `/broadcast`, `/close-friends`, `/guides`, `/highlights`; "QuantNeon" header rename | keep+spec or remove per item |
| QuantWave UI | `/bookmarks`, `/spaces` | keep+spec (small) |
| QuanTube UI | `/podcasts`, `/shows`, `/playlist/[id]` + fake-data cluster (P0) | P0 fakes in fix queue; rest keep+spec |
| QuantMax UI | `/challenges`, `/create`, `/creator-fund`, `/group-rooms`, `/videochat`, `/profile-detail` | keep+spec or remove per item |
| QuantCooks UI | `/brand-kit`, `/collaborate` | keep+spec |
| QuantAds UI | `/economy/*` (6 routes, honest "coming soon") | keep+spec |
| QuantMail backend extras | ai-devtools, e2ee relay, federation, workspaces, invoices, contact-groups, email-templates, quanty-mcp, dav, `/infra/*` utils, extra AI endpoints, `modules/company`, ERP services, agent-bus-mail-delivery, phone.ts | keep+spec (likely user-directed) except ERP strays → remove |
| Other apps' backend extras (~60 route files) | QuantChat ~20, QuantAI ~30, QuantGram 8, QuantWave 4, QuanTube 8, QuantMax 9, QuantCooks 5, QuantAds 9 | keep+spec or remove per item |
| Structure moves | `src/mobile/` ×8 → one platform package; `modules/company`, `modules/billing`, `modules/code` layering; `payment`/`payments`, `recommendation`/`recommendations`; economy sprawl; `imap-server`, `smtp-submission`, `dns-poller` services | move/merge per §13, don't just delete |

---

## Honesty wins worth preserving (do not regress)

Drive real stats; QuantGit honest empty states; CSAM fail-closed; userinfo fail-closed (#565);
QuantGram shopping real catalog; QuantCooks AITools/export honesty; QuantMax honest empty states;
QuantTube SAMPLE-badge labeling; QuantAI connectors/analytics real fetches; QuantMail settings
explicit "not end-to-end encrypted" copy; SSO-handoff URL scrubbing; `/health` never fabricates.

---

## Update cadence

This scoreboard is regenerated by the audit loops (Chrome QA, customer audit, orchestrator).
Edit it by hand only to correct facts — never mark anything done without evidence, per
`15-definition-of-done.md` (a screenshot, HTTP 200, or green TypeScript check is not done).

---
