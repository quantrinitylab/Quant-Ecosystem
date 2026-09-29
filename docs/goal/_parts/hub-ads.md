<!--
  GOAL.md — north-star part: "Hub & Monetization" cluster.
  Two apps: QuantMail (flagship / auth root / productivity super-hub) and
  QuantAds (monetization + gaming engine). Target-state vision; grounded in the
  real repo (OIDC/PKCE IdP, append-only credit ledger, Vickrey ad auction, Yjs
  CRDT collab, CalDAV/CardDAV, git-server + ci-runner + agent-runtime).
-->

## QuantMail — "Gmail + Google Workspace + GitHub + Claude Code killer"
**Now:** most mature app — email + SSO + `drive/` `calendar/` `repos/` `quantgit/` `codehub/` route segments exist (~900 files: 400+ backend tests, full OIDC/PKCE identity provider, Yjs collab server, CalDAV/CardDAV, git daemon, CI runner, agentic dev services). · **Target:** the ecosystem's flagship and non-negotiable backbone — a Gmail-beating mail client that is simultaneously the OAuth2/OIDC identity root for all 9 apps and a Workspace-class productivity super-hub (Drive + Docs + Calendar + Git/CodeHub) that embeds those products as first-class *features*, not siblings, and hosts the cross-app AI-memory that makes Quanty omniscient.

### Vision
QuantMail is the front door to the entire Quant Ecosystem. A user signs in here once; every other app is a relying party of QuantMail's identity provider. It is three products fused into one surface that no incumbent ships together:

1. **A Gmail killer** — sub-100ms threaded mail, agentic triage, native E2EE/PGP, CalDAV/CardDAV/IMAP/JMAP interop, self-hostable deliverability (SPF/DKIM/DMARC/ARC) and enterprise DLP.
2. **The identity + memory root** — a spec-complete OIDC provider (authorization-code + PKCE, RS256 id_tokens, JWKS, refresh rotation, consent, dynamic client registration) plus the ecosystem-wide **AI memory** vector store that every app writes to and Quanty reads from.
3. **A Workspace + GitHub + Claude-Code killer** — Drive (storage + the memory host), Docs (CRDT collaborative editing), Calendar (CalDAV + booking + eventing), and QuantGit/CodeHub (git hosting + CI/CD + an agentic coding assistant) all live *inside* QuantMail as embedded sub-apps sharing one identity, one billing wallet, and one AI.

The strategic thesis: Google's power is that Gmail, Drive, Docs, and Calendar share one login and one data graph — but they refuse to add git/agentic-dev, they monetize your attention, and their collaboration engine (OT) is server-bound. GitHub owns dev but has no mail/docs/calendar and bolts AI on as autocomplete. QuantMail unifies *all* of it under one credit-metered wallet, one privacy-first AI memory, and one agent (Quanty) that can act across mail, drive, docs, calendar, and repos in a single tool-use loop.

### Competitors & their real architecture

**Gmail** (the mail incumbent, ~1.8B users)
- **Storage:** message blobs land on **Colossus** (the GFS successor); per-user metadata, labels, and the search index live in **Bigtable**-class row stores with **Spanner** for globally-consistent slices. Mail is sharded per-user, not per-folder — labels are just indexed tags, so a message exists once and appears under many "folders."
- **Search:** a per-mailbox **inverted index** (postings lists over tokenized headers/body/attachments) fronted by ML ranking; operators (`from:`, `has:attachment`) compile to index filters. Attachment text is OCR'd/extracted server-side and indexed.
- **Spam & priority:** layered **ML classifiers** (TensorFlow, RETVec text vectorization, neural + reputation + rule ensembles) score spam/phishing; **Priority Inbox** ranks importance from engagement features. Runs server-side at ingest.
- **Protocols:** speaks **SMTP** (MTA), **IMAP/POP3** for clients, and exposes the proprietary **Gmail REST/gRPC API** (not JMAP — Gmail declined JMAP; Fastmail drives that standard). Threading is by `Message-ID`/`References`/`In-Reply-To` plus normalized-subject heuristics into a conversation view.
- **Offline:** Gmail-offline is a **Service Worker + IndexedDB** mirror of a recent window of mail; sync reconciles on reconnect.
- **→ Weakness we exploit:** closed, ad-funded (your mail *is* the product), no self-hosting, attachments capped at 25MB, consumer PGP is an afterthought, and there is *no* agentic layer that can act across mail + drive + calendar + code in one loop — and no third party can be a first-class identity relying-party of Gmail.

**Google Drive + Docs** (storage + the collaborative-editing gold standard)
- **Collaborative engine:** Google Docs is the canonical **Operational Transformation (OT)** system. Every keystroke is an *operation* (insert/delete/applyStyle over a positional model); a **central server holds the canonical revision** and transforms each client's ops against concurrent ops (`transform(op_a, op_b)`) so all replicas converge. Clients send ops, receive transformed ops + acks, and rebase pending local ops.
- **Sync transport:** historically **BrowserChannel**, now persistent gRPC-web/long-poll channels; the server serializes the op stream — it is the single ordering authority (and the scaling bottleneck).
- **Drive storage:** files on **Colossus**, content-addressed with dedup; metadata/ACLs in Spanner/Bigtable; Docs are *not* real files but a proprietary op-log model materialized on open.
- **→ Weakness we exploit:** OT needs a live server round-trip and a central serializer — it is **not offline-first** and degrades on flaky links; Docs lock you into a proprietary format; Drive search is keyword-only with **no semantic/vector recall**; there is no version-control-grade history for arbitrary binary files and no AI memory fed by the rest of your life.

**GitHub** (code hosting + CI + review)
- **Git at scale:** repositories are stored and replicated by **Spokes** (formerly DGit) — three-replica consistent git storage — with **libgit2/Rugged** for plumbing and packfile-level access behind the smart-HTTP and SSH transports.
- **Code search:** rebuilt as **"Blackbird,"** a Rust **trigram/ngram inverted index** over billions of files, sharded, incremental on push.
- **Actions/CI:** workflows are YAML DAGs executed by **runners** (ephemeral VMs/containers) that pull jobs, stream logs, and report **commit statuses/checks**; branch protection gates merges on required checks.
- **Review model:** PRs diff base↔head, thread review comments on lines, and offer merge/squash/rebase strategies; **webhooks** fan events out over HTTP.
- **→ Weakness we exploit:** AI is bolted on (Copilot = completion/chat, not a repo-native agent that self-heals CI and opens its own PRs); dev is siloed from mail/docs/calendar/identity; enterprise-priced per-seat with no unified currency; code search is lexical, not semantic.

**Claude Code / GitHub Copilot** (the agentic-coding layer)
- **LLM + tool-use over the repo:** an **agentic loop** — read files → run commands → edit → run tests → observe → repeat — with function-calling tools and human approval gates. Copilot's core is **FIM (fill-in-the-middle)** completion primed by open tabs + **LSP** symbols.
- **Context assembly:** retrieval over the repo + **Language Server Protocol** (definitions, references, diagnostics) feeds the model; larger context windows + embeddings-based file retrieval widen the horizon.
- **→ Weakness we exploit:** it lives *beside* your git/CI/identity, not *inside* them; per-seat pricing, single-vendor model, no ecosystem memory, no cross-app/device actions, and no ability to spawn a supervised *swarm* of agents against one repo.

**Google/Apple Calendar** (time)
- **Protocols:** **CalDAV (RFC 4791)** over WebDAV with **iCalendar/VEVENT (RFC 5545)**; recurrence via **RRULE** expansion; availability via **VFREEBUSY**; invites via **iTIP/iMIP**. CardDAV mirrors this for contacts.
- **→ Weakness we exploit:** calendar is siloed from mail/meeting intelligence; no agent that reads your inbox and *reschedules* around conflicts; booking (Calendly) and ticketed events (Eventbrite) are separate paid products; no credits/payments on bookings.

### What we build to beat them
- **Identity you can build on.** A spec-complete OIDC/OAuth2 provider (already real): `/oauth/authorize` with server-validated `redirect_uri` (open-redirect-safe), **PKCE S256**, confidential-client auth (SHA-256 secret with constant-time compare + auto-upgrade), single-use authorization codes consumed *after* PKCE + redirect rebinding, **RS256 id_tokens** signed by a rotating OIDC key with published **JWKS**, refresh-token rotation/revocation (RFC 7009), and **Dynamic Client Registration** (`/oauth/register`). Discovery at `/.well-known/openid-configuration`. Every other Quant app is a registered first-party client — this is the backbone, not a feature.
- **CRDT collaboration, not OT.** Docs is built on **Yjs CRDTs** (real `yjs-server` + `collab-persistence` + `CollabDocumentUpdate` update-log), so editing is **offline-first and serverless-tolerant**: replicas merge without a central op-serializer, sync resumes after disconnect, and there is no single ordering bottleneck. This is a structural win over Docs' OT.
- **Real git + real CI + a real agent.** Native `git-server` (smart-HTTP + git daemon), `ci-runner` (CiRun/CiJob), and an **agentic dev runtime** (`agent-runtime`, `agentlab`) that runs Claude-Code-style loops *inside* the repo: `ai-code-search` (semantic), `ai-code-review`, `ai-commit-message`, `ai-pr-description`, `ai-security-scan`, and `ai-ci-fix` (watches a red pipeline and pushes the fix). Multi-model via **OpenRouter**, with approval-gating, per-agent iteration bounds, branch-isolation + human-gated merge, and tenant isolation — provably (property-tested).
- **AI memory as a first-class store.** A **pgvector**-backed memory (`MemoryRecord`/`MemoryEmbedding`/`DocumentChunk`) hosted in Drive, written by *every* app, with an anti-creep write policy (explicit-write / pending-review candidates the user approves), per-entry access logs, category scoping, and one-click export/purge. This is what makes Quanty recall across your whole life.
- **Deliverability you own.** `deliverability-auth` (SPF/DKIM/DMARC/ARC signing + `dns-poller` verification), `smtp-inbound` ingest, suppression lists, `tracking-pixel-stripper`, PGP/E2EE, undo-send, smart-send-time — a mail stack you can self-host and that lands in the inbox.
- **One wallet across all of it.** Every metered action (AI tokens, storage overage, CI minutes, agent runs) debits the same **append-only Quant Credits ledger** used ecosystem-wide, so there is one bill, one balance, one currency.

### Core features
- **Mail client:** conversation threading, labels + folders, filters/rules (`mail-filter`), snooze, starred, drafts, scheduled send + `undo-send`, `smart-send-time`, vacation/auto-responder, aliases, signatures, templates, contacts + contact groups, full-text + semantic search (`search-query` over Meilisearch + Qdrant), IMAP import (`imap-importer`, `mbox-parser`), and per-message threading views under `/thread/[id]`.
- **Agentic email intelligence:** `ai-triage`, `ai-summarize`, `ai-reply`/`ai-compose` (tone-shift, style-learner trained on your sent mail), `ai-followup`, `ai-unsubscribe`, `ai-meeting-extract` (→ Calendar events), `ai-attachment-summary`, `ai-extract-data` — all metered against the credit wallet, all writing salient facts to AI memory.
- **Identity provider & SSO:** the OIDC/OAuth2 endpoints above, plus sessions **persisted to Postgres** (`Session`/`RefreshToken`), 2FA + backup codes, personal access tokens, password reset, and a `/sso` chooser. Enterprise: SAML/OIDC federation, **SCIM** provisioning, organizational units, and domain verification.
- **Drive + Docs + Calendar + Git** as embedded sub-apps (see next section) — each a first-class product on the same login, wallet, and AI.
- **Security & compliance:** E2EE (`e2ee` routes, PGP), audit logs, DLP/compliance rules, message quarantine, legal hold, matter management, vault export, SIEM export, retention policies, disposable-email detection, attachment AV scanning.
- **Quanty everywhere:** the assistant is docked in every QuantMail surface and can act — "summarize this thread and draft a reply," "file everything from Acme into a label," "turn this email into a calendar event and invite the sender," "open a PR that fixes the failing test."

### Embedded sub-apps
These are not separate apps — they are features of QuantMail, sharing its identity, wallet, AI memory, and shell. Routes already exist (`/drive`, `/drive/doc/[docId]`, `/calendar`, `/repos`, `/quantgit`, `/codehub`).

#### QuantDrive — the Google Drive killer + the ecosystem's AI-memory host
- **Vision:** a versioned, shareable object store (`File`/`Folder`/`Share`/`DriveShare`/`FileVersion`/`FileIndex`) on **Cloudflare R2** that doubles as the physical home of the cross-app **AI memory** vector store — the single most strategic surface in the ecosystem, because it is what Quanty *remembers* from.
- **Competitor & how it works:** Google Drive keeps blobs on Colossus with keyword-only metadata search and no semantic recall; Dropbox adds sync but no AI. → **Weakness we exploit:** neither indexes your files into a queryable vector memory or feeds an assistant.
- **What beats them:** chunked/resumable multipart upload with quota enforcement, file versioning + restore, granular sharing/ACLs, cam-scanner → auto-cropped PDF, and every upload is chunked, embedded (`DocumentChunk`), and written to `MemoryRecord`/`MemoryEmbedding` (pgvector) so Quanty can answer "find the contract Priya sent in March and summarize the liability clause" across mail + drive + docs.
- **Key features:** drive-sync (delta sync + conflict resolution), backup snapshots, AI file summarize/extract, semantic search over all content, storage-quota + overage metered to credits, R2-signed direct download.

#### QuantDocs — the Google Docs killer (lives inside Drive)
- **Vision:** real-time collaborative documents (`Document`/`DocumentVersion`/`DocComment`/`DocSuggestion`/`DocumentCollaborator`) that are **offline-first** and never lose work.
- **Competitor & how it works:** Google Docs uses server-authoritative **Operational Transformation** — a central serializer transforms concurrent ops. → **Weakness we exploit:** it requires a live round-trip and is not offline-tolerant.
- **What beats them:** built on **Yjs CRDTs** (`yjs-server`, `collab-persistence`, append-only `CollabDocumentUpdate` log with snapshot offload for durability) — presence/awareness cursors, merge without a central authority, resume after disconnect. Plus **doc-branching** (fork/merge a doc like git), **paragraph-level permissions**, suggestions/comments, templates, and PDF tooling.
- **Key features:** version history + restore, per-paragraph ACLs, live co-presence, Quanty-authored drafts ("write the Q3 recap from these three threads"), export to PDF/DOCX.

#### QuantCalendar — the Google/Apple Calendar (+ Calendly + Eventbrite) killer
- **Vision:** time and scheduling wired directly into mail, contacts, meetings, and payments (`Event`/`Calendar`/`BookingLink`).
- **Competitor & how it works:** Google/Apple Calendar speak **CalDAV + iCalendar/VEVENT** with **RRULE** recurrence and **VFREEBUSY** availability; Calendly and Eventbrite are separate paid bolt-ons. → **Weakness we exploit:** calendars are siloed from mail intelligence and from booking/ticketing/payments.
- **What beats them:** native **CalDAV/CardDAV** interop (`caldav.service`, `carddav.service`, DAV discovery) so Apple Calendar/Thunderbird sync out of the box, RRULE recurrence at parity, plus **booking links** with buffers + staff/round-robin, seating charts, ticketed events with check-in and countdown passes, invoices/quotes/price-books — and `calendar-call-alert` that auto-launches a QuantMeet room when a meeting starts.
- **Key features:** free/busy, agentic scheduling (Quanty reads your inbox, proposes times, reschedules around conflicts), meeting extraction from email, credit-priced paid bookings/tickets, deep QuantChat/QuantMeet automation.

#### QuantGit / CodeHub — the GitHub + Claude Code + CI/CD killer
- **Vision:** git hosting, code review, CI/CD, *and* an agentic coding assistant on one identity and one wallet (`Repository`/`Branch`/`PullRequest`/`Review`/`ReviewComment`/`Issue`/`BranchProtection`/`CiRun`/`CiJob`).
- **Competitor & how it works:** GitHub stores repos on **Spokes** (3-replica git), searches with the **Blackbird** trigram index, runs YAML workflows on ephemeral runners, and gates merges on required checks; Copilot adds FIM completion + chat beside it. → **Weakness we exploit:** AI is adjacent, not repo-native; dev is walled off from mail/docs/identity; per-seat pricing.
- **What beats them:** a real **`git-server`** (smart-HTTP + `codehub-git-daemon`), PR/review/branch-protection parity, **`ci-runner`** pipelines, and an **`agent-runtime`** (`agentlab`) that runs Claude-Code-style loops in-repo: semantic `ai-code-search`, `ai-code-review`, `ai-commit-message`, `ai-pr-description`, `ai-security-scan`, and `ai-ci-fix` (self-heals a red build and pushes). A **`company-orchestrator`** can spawn a *supervised swarm* of agents (`agent-org`/`agent-swarm`/`AgentWorker`) against one repo, budget-reserved against credits, with human-gated merges. Multi-model via OpenRouter.
- **Key features:** semantic + lexical code search (Meilisearch + Qdrant), repo migration/import, CI logs + healing, agent branch isolation, review bots, in-browser editor (`/repos/[id]/editor`), credit-metered agent runs and CI minutes.

### Deep / micro features (the long-tail lock-in)
- **Mail craft:** send-and-archive, split-inbox / learned categories (`smart-inbox` + `learned-inbox-category` with backfill), per-contact frequency + `ai-contact-context` (a CRM card on every sender), CRM pipelines, `smart-send-time` (best time per recipient), tracking-pixel stripping by default, ARC-sealing for forwarded mail, plus-addressing/aliases, disposable-email detection, one-click unsubscribe via `List-Unsubscribe`.
- **Style & privacy:** an on-device-ish `ai-style-learner` that mimics *your* voice per-recipient; PGP keyring management; per-thread E2EE toggles; retention rules that auto-purge; suppression lists honored across sends.
- **Drive/Docs micro:** doc branching + merge, paragraph permissions, snapshot-offloaded CRDT durability (collab survives a crash mid-edit), cam-scanner deskew, remote-file ingest (pull a URL straight into Drive), backup snapshots you can diff.
- **Calendar micro:** booking buffers + staff round-robin, seating charts, ticket check-in, event countdown passes, price-book quotes → invoices, VFREEBUSY across shared calendars, timezone-aware RRULE expansion tested to parity.
- **Dev micro:** commit-message + PR-description generation, security-scan gate on PRs, CI auto-heal with an audit trail, agent iteration bounds (never runs away), branch-isolation so an agent can't clobber `main`, review-bot comments threaded on lines.
- **Cross-cutting:** everything meaningful writes a memory candidate the user can approve/reject/purge-by-tag; every AI action is credit-metered and audit-logged; every mutation to shared state emits an `OutboxEvent` for the CDC relay.

### UI/UX & 3D
- **Design direction:** a calm, dense, keyboard-first workspace (command palette everywhere, `j/k` navigation, everything reachable in ≤2 keystrokes) unified by the `@quant/brand` token system (each app derives its hue; QuantMail owns the neutral "root" identity). Instant optimistic UI backed by local-first caches; sub-frame thread open.
- **3D where it earns its place (not decoration):**
  - **Knowledge-graph view of Drive + AI-memory** — a **react-three-fiber / WebGL2** force-directed graph of files, docs, threads, people, and memory nodes, edges weighted by embedding similarity; fly through your knowledge, click a node to open the source. WebGPU compute for the force layout on capable devices, GLSL points/edges for tens of thousands of nodes.
  - **QuantGit 3D commit/repo galaxy** — an instanced 3D commit-graph / dependency map (branches as ribbons, commits as instanced meshes, CI status as color) rendered with `THREE.InstancedMesh` + a GPU-picking pass.
  - **Storage/quota heatmap** — a 3D treemap of Drive usage.
- **Per-device adaptation:** WebGPU → WebGL2 → 2D-canvas fallback ladder; the 3D graph downshifts node counts and disables post-processing on mobile/low-power; desktop (Tauri) gets the full compute-shader layout. Respects `prefers-reduced-motion`.
- **Accessibility:** every 3D view has a first-class 2D/list equivalent (the graph is also a filterable table); full ARIA + focus management; the command palette is the accessible spine; WCAG-AA contrast enforced by the token validator; screen-reader announcements for async AI/agent actions.

### Data & backend
- **Prisma domains (Postgres + pgvector):**
  - *Identity/SSO:* `User`, `OAuthAccount`, `Session`, `RefreshToken`, `OAuthClient`, `OAuthConsent`, `AuthorizationCode`, `PersonalAccessToken`, `TwoFactorBackupCode`, `PasswordResetToken` — sessions persisted to Postgres (SSO phase 0).
  - *Mail:* `Email`, `EmailThread`, `EmailFolder`, `Label`, `MailFilter`, `Contact`, `ContactGroup`, `VacationResponder`, `EmailTemplate`, `EmailSignature`, `MailAttachment`, `EmailSuppression`, `DomainAuthKey`.
  - *Drive/Docs:* `File`, `Folder`, `Share`, `DriveShare`, `FileVersion`, `FileIndex`, `Document`, `DocumentVersion`, `DocComment`, `DocSuggestion`, `DocumentCollaborator`, `CollabDocumentUpdate`.
  - *Calendar:* `Event`, `Calendar`, `BookingLink`.
  - *Git/CI:* `Repository`, `Branch`, `PullRequest`, `Review`, `ReviewComment`, `Issue`, `IssueComment`, `BranchProtection`, `CiRun`, `CiJob`.
  - *AI memory & agents:* `MemoryRecord`, `MemoryEmbedding`, `DocumentChunk` (pgvector), `AgentSession`, `AgentOrg`, `AgentWorker`, `AgentWorkItem`, `AgentMailboxIdentity`, `AgentActionAudit`, `AgentTranscript`.
  - *Billing:* `CreditLedgerEntry` (append-only), `PlanSubscription`, `PaymentRecord`, `OverageSetting`, `Payout`.
  - *Enterprise:* `Organization(al)Unit`, `OrganizationDomain`, `EnterpriseSsoConfig`, `ScimClient`, `EnterpriseMailComplianceRule`, `AdminQuarantineMessage`, `EnterpriseMatter`, `LegalHold`/`EnterpriseLegalHold`, `EnterpriseVaultExport`, `EnterpriseSiemConfig`.
- **Services:** `smtp-inbound` (inbound MTA/ingest), `deliverability-auth` (SPF/DKIM/DMARC/ARC) + `dns-poller`, `outbound-delivery`/`delivery-worker`, `git-server` (git daemon), `ci-runner`, `agent-runtime`/`company-orchestrator`, `yjs-server` (CRDT), `caldav`/`carddav`, `spam-classifier`, `search-indexer` feeding **Meilisearch** (lexical) + **Qdrant** (vector).
- **Storage/search:** attachments, Drive blobs, Docs snapshots, and CI artifacts on **Cloudflare R2** (signed URLs, multipart); full-text via Meilisearch; semantic recall via Qdrant + pgvector `MemoryEmbedding`.
- **Identity is the root:** the OIDC key service publishes JWKS; issued JWTs (`iss`/`aud` aligned with `@quant/server-core`) are the currency of trust for every other app's API.
- **Credits ledger:** balance is **derived** as `SUM(amount)` over immutable `CreditLedgerEntry` rows bucketed DAILY/MONTHLY/PURCHASED; consumption order DAILY→MONTHLY→PURCHASED; idempotent debits keyed by `actionKey`; fail-closed on `total < amount` (402 OUT_OF_CREDITS) so a balance can never go negative.
- **Eventing:** every mutation appends an `OutboxEvent` drained by `cdc-relay` into Kafka for cross-app projection (search indexing, memory writes, notifications).

### Cross-app integration
**QuantMail is the backbone of the entire ecosystem — say it plainly:**
- **SSO root for all 9 apps.** QuantChat, QuantAI, QuantMax, QuantGram, QuantWave, QuantCooks, QuanTube, and QuantAds are all **OAuth2/OIDC relying parties** of QuantMail. They redirect to `/oauth/authorize`, receive an authorization code (PKCE), exchange it for tokens + an RS256 id_token, and verify against QuantMail's JWKS. One login, one identity, one consent ledger, ecosystem-wide sign-out via refresh-token revocation.
- **AI-memory root for all 9 apps.** Every app writes salient signals to the pgvector memory hosted in QuantDrive (a reel you liked in QuantWave, a recipe saved in QuantCooks, a repo you starred, a person you DM in QuantChat). Quanty reads this unified memory to make cross-app recommendations and recall — "the doc I mentioned to Sam last week," "boost the reel that did best," "who did I meet about the Q3 launch."
- **Quanty actions (exact):** *"summarize this thread and reply in my voice"*, *"turn this email into a calendar event and DM the attendees on QuantChat"*, *"find the contract in Drive and extract the renewal date"*, *"open a PR on CodeHub that fixes the failing CI job"*, *"spawn a 3-agent swarm to migrate this repo to React 19"*, *"remember that Priya prefers async updates."*
- **Notifications via QuantChat:** agent-run completions, CI status, booking confirmations, and memory-approval prompts are delivered as QuantChat messages/notifications (shared `Notification` + push).
- **Links out:** Calendar meetings open **QuantMeet** rooms; mail "share to" targets QuantGram/QuantWave; CodeHub CI can post to any app; QuantAds bills its ad spend and pays creators through the same wallet QuantMail meters.

### Platform presence
Per the per-app restructure, QuantMail owns its full surface under `apps/quantmail/`: `web/` + `backend/` + `desktop/` + `mobile/` + `admin/` + `marketing/` (no shared shells).
- **Web:** Next.js 15 / React 19 App Router (the ~900-file surface today). PWA with Service Worker + IndexedDB offline mail mirror.
- **Desktop (Tauri):** a native mail + drive + docs + code client with OS integration — system tray, native notifications, global hotkeys, local file drag-and-drop into Drive, offline CRDT editing, and a local agent runner. Tauri (Rust core) for a small footprint over Electron.
- **Mobile (Capacitor):** inbox, drive, docs, calendar, and lightweight code review; push via the shared notifications package; biometric unlock; camera → cam-scanner → Drive.
- **This app's OWN admin panel:** QuantMail admin = **domain / DLP / identity** — domain verification + DKIM/DMARC keys, deliverability health, compliance/DLP rules, message quarantine, legal hold + matter management, vault + SIEM export, SCIM/SSO federation config, OAuth client registry, org units. (It does **not** contain ad review or payout tooling — that is QuantAds' admin.)
- **This app's OWN marketing page:** positions QuantMail as "your whole workday on one login" — mail + drive + docs + calendar + code + AI, one wallet, self-hostable, privacy-first; the identity/enterprise story (OIDC, SCIM, DLP) headlines the B2B funnel.

---

## QuantAds — "Meta Ads + Google Ads + Roblox killer"
**Now:** scaffolded (web + backend exist) — real second-price ad-auction service, campaign/ad-set/creative/serving/analytics/click-fraud services, privacy-ads package (on-device ranker, contextual targeting, consent, brand-safety, disclosure), creator-economy + credits wallet + publisher-payout scheduler, and a cross-app-gaming package with working Uno/Ludo/Monopoly/Othello/Connect-Four engines + universal leaderboard. · **Target:** the ecosystem's monetization + gaming engine — the demand-side ad platform *and* the supply-side creator-payout + in-game economy that flows Quant Credits through every one of the 9 apps.

### Vision
QuantAds is where money moves. It is two flywheels sharing one currency:
1. **The ad platform (demand side):** advertisers run campaigns with a real-time **sealed-bid second-price auction** and privacy-preserving targeting; ads are placed **in-feed and in-game across all 9 apps** (QuantGram posts, QuantWave timelines, QuanTube pre-roll, QuantChat channels, in-game banners). Advertisers pay in Quant Credits.
2. **The creator + gaming economy (supply side):** creators and publishers earn Quant Credits from ad revenue-share, boosts, and item sales, and **withdraw daily**; players compete in multiplayer games (Uno/Ludo/Monopoly-style) with ranks and leaderboards; builders **ship their own Godot/WebGL multiplayer games** with an in-game economy tied to credits.

The point of QuantAds is that it closes the loop the incumbents keep apart: Meta/Google take advertiser money but pay creators poorly and run no games; Roblox has a creator economy and games but no ad exchange and its own funny-money. QuantAds runs the auction, pays creators in the *same* dollar-pegged credit the whole ecosystem spends, and turns games into both a retention surface and an ad inventory — all governed by one append-only ledger and one privacy policy.

### Competitors & their real architecture

**Meta Ads** (the social-ads machine)
- **The auction:** every impression is a **per-user auction** where an ad's **total value = advertiser bid × estimated action rate (pAction) × ad quality/relevance** (user-value + low-quality penalties). The highest total value wins; the advertiser is charged roughly the minimum needed to beat the runner-up (a generalized second-price mechanic), so a great creative wins cheap.
- **pAction models:** deep-learning CTR/CVR predictors score each candidate per person in real time; **Advantage+** automates targeting, placements, budget, and creative selection with ML (Advantage+ Shopping/audience).
- **Measurement:** the **Meta Pixel** fires client-side events; the **Conversions API (CAPI)** sends the same events server-side (surviving iOS ATT / cookie loss), **deduplicated by `event_id`**. Attribution windows fold conversions back to ads.
- **Audiences:** **Custom Audiences** match uploaded **hashed PII**; **Lookalikes** model similarity (embedding/nearest-neighbor over a seed) to expand reach; value-based lookalikes weight by LTV.
- **Delivery:** budget **pacing** (even/accelerated) and a **learning phase** (~50 conversions to stabilize a model).
- **→ Weakness we exploit:** the whole edifice runs on **cross-site PII tracking** that privacy regulation and ATT have gutted; it's opaque; creator payouts are stingy and slow; there is no unified currency and no games as inventory; small advertisers drown in complexity.

**Google Ads** (intent + the ad server)
- **Quality Score (1–10):** expected CTR + ad relevance + landing-page experience; **Ad Rank = bid × Quality Score** (+ ad extensions/context), so relevance can beat a higher bid. A **real-time auction runs per query**.
- **Inventory:** search keyword auctions plus display/video **RTB** through DV360/AdX, with **Google Ad Manager (GAM)** as the ad server doing line-item decisioning, forecasting, and delivery.
- **→ Weakness we exploit:** keyword-only intent, opaque Quality Score, punishing complexity, no creator economy, no ecosystem-owned placements, no gaming.

**Roblox / creator-game platforms** (the UGC-game economy)
- **How it works:** a game client + server authority with a proprietary scripting runtime; creators publish experiences; a **soft currency (Robux)** funds purchases and a **DevEx** program converts a cut back to cash; matchmaking + leaderboards + a marketplace drive retention.
- **→ Weakness we exploit:** a walled, non-dollar currency with a poor and opaque payout cut; no ad exchange; games are isolated from any broader social/commerce graph; heavy client lock-in.

### What we build to beat them
- **A transparent second-price auction.** The `ad-auction` service runs a **sealed-bid Vickrey auction**: eligible candidates (bid ≥ reserve, budget covers bid, targeting matches) are sorted by bid; the winner pays **one cent above the next-highest eligible bid, floored at the reserve and capped at its own bid**, with deterministic tie-breaks. The target evolves this to a value auction — **rank = bid × pAction × quality** — where `pAction` comes from the `ad-serving` + ranking models (the `ad-engine` service), but the *clearing rule stays a documented second-price*, not a black box.
- **Privacy-preserving targeting.** The `privacy-ads` package targets **without cross-site PII**: an **on-device ranker** scores candidates locally, **contextual targeting** uses page/interest context (not identity), a **behavioral-opt-in** gate requires explicit consent, and a **privacy-enforcer** + **ad-disclosure** + **brand-safety** layer keep it clean. Interest signals (`UserInterestSignal`) are first-party and user-visible. This is a structural answer to the post-ATT world Meta/Google are scrambling in.
- **A Conversions-API done right.** Conversions are captured server-side through the ecosystem's own **`cdc-relay`/OutboxEvent** stream (first-party, no third-party pixel), deduplicated by event id — accurate *because* the advertiser's storefront can live in the same ecosystem (QuantGram/QuanTube/commerce).
- **Creators paid in real money, daily.** Ad revenue-share, boosts, and item sales credit the **append-only ledger** as `boost_earning`/`creator_payout`/`marketplace_sale` entries (PURCHASED bucket, cash-out-eligible); the **withdraw-scheduler** + **publisher-payout** run daily auto-withdrawals (`AutoWithdrawSetting`/`WithdrawSchedulerRun`/`PublisherPayoutRun`/`Payout`), drawing **PURCHASED-only** so free/plan credits are never cashed out.
- **Games as a first-class surface *and* inventory.** The `cross-app-gaming` package already ships deterministic engines (Uno/Ludo/Monopoly/Othello/Connect-Four), a **universal leaderboard**, a **cross-app host**, an **identity bridge** (SSO into any game), and **minor-safety** gating. Target: a **Godot/WebGL multiplayer runtime** users can build on and ship, with in-game banner placements auctioned by the same ad-engine and an in-game economy denominated in credits.
- **One currency, dollar-pegged.** 1 credit ≈ $1; advertisers fund campaigns, players buy items, creators withdraw — all the same ledger, so value never gets trapped in funny-money.

### Core features
- **Campaign management:** `Campaign` → `AdSet` → `Ad` → `AdCreative` hierarchy (Meta-parity), objectives, budgets + pacing, schedules, targeting (interests/geo/behaviors), status control, and a dashboard. AI helpers: `ai-ad-copy`/creative-suggestions, budget recommendation, and performance prediction routes.
- **Real-time bidding & serving:** `ad-request` → auction → serve pipeline (`ad-serving`), reserve/floor prices, budget-eligibility, impression + `AdClickEvent` tracking, and `click-fraud` detection. Bidding stats + model endpoints.
- **Targeting & audiences:** interest/behavior taxonomies, geo, custom audiences, and **lookalike** modeling (`audience-lookalike`), reach/estimate previews, retargeting, all under the privacy-ads consent gate.
- **Analytics & measurement:** campaign analytics, reports, A/B testing (`ab-testing`), conversion tracking (`conversion-tracking`), first-party attribution via the CDC event stream.
- **Placements across the ecosystem:** in-feed (QuantGram/QuantWave/QuanTube), in-channel (QuantChat groups/channels, Telegram-style), and **in-game banners**; **cross-app boost** of reels/posts ("boost my last reel for 500 credits").
- **Creator economy:** creator listings + marketplace (`creator-listing`/`creator-marketplace`), earnings dashboards, tiers, brand partnerships, remix royalties, tax reporting, and **daily credit withdrawals**.
- **Gaming:** matchmaking (the `matchmaking` service) into multiplayer sessions (`NeonGameSession`/`GameScore`/`GameBadge`), ranks + universal leaderboards, badges, minor-safety gating, and a builder path for user-shipped Godot/WebGL games with a credit-denominated in-game economy.

### Deep / micro features (the long-tail lock-in)
- **Auction craft:** per-placement reserve/floor tuning, deterministic tie-breaks (stable results), budget-aware eligibility (never overspends remaining budget), pacing to avoid early-day burnout, frequency capping per user, and an explainable "why you're seeing this ad" disclosure card on every impression.
- **Fraud & safety:** click-fraud scoring (velocity/pattern), invalid-traffic filtering, brand-safety category exclusions, advertiser + creative review queues, and creator payout holds on suspected fraud.
- **Creator micro:** gifting, subscriptions, tip jars, bundle/store listings, remix-royalty splits that auto-credit original creators, tier perks, referral credits (`referral` earn-kind), and per-day withdrawal caps with `PURCHASED`-only cash-out so free credits are never withdrawn.
- **Gaming micro:** deterministic game engines (replayable/verifiable match state), universal cross-game leaderboards + badges, spectator + rematch, in-game item drops as `marketplace_sale` credit entries, tournament brackets with credit prize pools, and COPPA-style minor-safety (no ads/no chat/no purchases for minors).
- **Economy micro:** daily free credit allowance (non-rolling — yesterday's unused daily credits expire via a reconciling ledger entry), idempotent boosts (a retried "boost" never double-charges), and every earn/spend visible as an immutable ledger row the user can audit.
- **Advertiser QoL:** AI-generated creative variants + copy, budget/performance forecasting, one-click "boost across QuantGram + QuantWave," and Quanty-driven campaign ops in natural language.

### UI/UX & 3D
- **Design direction:** two distinct surfaces on one brand hue — a **data-dense advertiser console** (campaign tables, funnels, cohort charts, live spend) and a **playful economy/gaming surface** (wallet, boosts, store, leaderboards, game lobby). Charts follow the shared dataviz system; live numbers stream over the ws-gateway.
- **3D where it earns its place:**
  - **Live 3D analytics dashboards** — a **react-three-fiber / WebGL2** globe/heat-surface of impressions and spend by geo in real time, a 3D funnel (impression → click → conversion) with animated flow, and an auction-pressure surface showing bid density per placement. WebGPU compute for large point clouds, GLSL shaders for the flow/heat gradients.
  - **The game surface itself** — the **Godot/WebGL** multiplayer runtime is the literal 3D/2D game canvas users build and play in; in-game banner placements render as textured surfaces inside the scene.
  - **Leaderboard/rank visualizations** — an instanced 3D podium/ladder.
- **Per-device adaptation:** WebGPU → WebGL2 → 2D-canvas chart fallback; games declare a capability tier and downshift resolution/effects on mobile; the advertiser console is fully usable as plain tables/charts with no 3D.
- **Accessibility:** every 3D analytic has a table/chart equivalent; games expose colorblind-safe palettes, remappable controls, reduced-motion modes, and captions for audio cues; WCAG-AA across the console; every ad carries an accessible disclosure ("Why am I seeing this?").

### Data & backend
- **Prisma domains:**
  - *Ads:* `Campaign`, `AdSet`, `Ad`, `AdCreative`, `AdClickEvent`, `PublisherPayoutRun` (targeting/budget as JSON columns parsed into auction candidates).
  - *Economy/credits:* `CreditLedgerEntry` (append-only, shared), `Payout`, `AutoWithdrawSetting`, `WithdrawSchedulerRun`, `PlanSubscription`, `PaymentRecord`, `OverageSetting`; creator surfaces `CreatorListing`/`CreatorPurchase`.
  - *Gaming:* `NeonGameSession`, `GameScore`, `GameBadge` (+ universal leaderboard state), with `UserInterestSignal` feeding privacy-first targeting.
  - *Config:* `PlatformConfig`, `FeatureFlag`.
- **Services:** the **`ad-engine`** (auction + serving + pacing + bidding models), `campaign`/`ad-set`/`ad-creative`/`analytics` services, `click-fraud`, `credits-wallet` + `publisher-payout-scheduler`, `creator-listing`/`creator-marketplace`, plus ecosystem infra: **`matchmaking`** (game sessions), **`moderation-worker`** (creative + game-content review), **`signal-projector`** (interest signals from CDC), **`ad-engine`** placements consumed by every app, and the **`ci-runner`** for shipped-game builds.
- **Storage/search:** ad creatives, game assets/bundles, and payout statements on **Cloudflare R2**; searchable campaigns/creators via **Meilisearch**; audience/lookalike similarity via **Qdrant** embeddings over first-party interest vectors.
- **The credits ledger (shared, authoritative):** balance derived as `SUM(amount)` over immutable rows; earn-kinds (`creator_payout`, `boost_earning`, `streak_reward`, `marketplace_sale`, `referral`) land in PURCHASED and are cash-out-eligible; **payouts debit PURCHASED-only** and are idempotent per `actionKey`; daily grant is non-rolling; every advertiser charge and creator payout is one append-only, auditable entry. Ad spend and payouts emit `OutboxEvent`s onto `cdc-relay`/Kafka for analytics and cross-app projection.

### Cross-app integration
**QuantAds is the monetization + gaming layer that touches every app:**
- **Placements everywhere.** The `ad-engine` serves auctioned inventory into QuantGram feeds, QuantWave timelines, QuanTube pre/mid-roll, QuantChat groups/channels (Telegram-style), and in-game banners — every social surface is inventory, decisioned by one auction.
- **Boosts everywhere.** Any post/reel/video/stream in any app can be boosted for credits; the boost debits the creator/advertiser wallet and amplifies reach via the same auction (cross-app boost of reels/posts/streams).
- **Payouts everywhere.** Creators in QuantGram, QuanTube, QuantWave, and QuantCooks earn into the shared ledger and withdraw daily through QuantAds' payout scheduler — one earnings balance across the ecosystem.
- **Games everywhere.** The `cross-app-gaming` host + identity bridge lets any social app open a multiplayer game (Uno/Ludo/Monopoly-style) inline; scores roll up to the universal leaderboard; matches are SSO-authenticated via QuantMail and minor-safety-gated.
- **Identity + memory from QuantMail.** QuantAds is a relying party of QuantMail's OIDC (advertisers, creators, players all sign in once) and reads AI memory for privacy-safe, first-party interest signals.
- **Quanty actions (exact):** *"boost my last reel for 500 credits"*, *"place this ad across QuantGram + QuantWave with a $50 budget"*, *"send a UPI payment request for my creator withdrawal"*, *"start a Ludo match with my QuantChat group"*, *"show me which campaign had the best ROAS this week and double its budget."*
- **Notifications via QuantChat:** budget-spent alerts, payout confirmations, game invites, and leaderboard changes are delivered as QuantChat messages/push.

### Platform presence
Per the per-app restructure, QuantAds owns its full surface under `apps/quantads/`: `web/` + `backend/` + `desktop/` + `mobile/` + `admin/` + `marketing/`.
- **Web:** Next.js 15 / React 19 advertiser console (`/campaigns`, `/creatives`, `/audiences`, `/analytics`, `/billing`) + economy surface (`/economy/{wallet,boost,creator,store,subscriptions}`); live spend/impression streams over the ws-gateway.
- **Desktop (Tauri):** a "creator studio + ad ops" client — bulk campaign editing, offline draft creatives, a local build/preview harness for shipped Godot/WebGL games, and native notifications for budget/payout events.
- **Mobile (Capacitor):** the everyday consumer surface — wallet, daily credit claim, boost-a-post, creator earnings + one-tap daily withdrawal, the games lobby, and leaderboards; push for invites/payouts; camera for creative upload.
- **This app's OWN admin panel:** QuantAds admin = **ad review / payout / fraud** — creative + advertiser review queues, brand-safety policy, click-fraud dashboards + payout holds, withdrawal/payout run monitoring, game-content moderation, in-game economy config, and platform/feature-flag config. (It does **not** contain mail/identity/DLP tooling — that is QuantMail's admin. Per the per-app principle, each of the 9 apps keeps its *own* admin in its own place; there is no single mega-admin.)
- **This app's OWN marketing page:** two funnels on one page — a **B2B advertiser** pitch ("transparent second-price auction, privacy-first targeting, placements across 9 apps, pay in credits") and a **creator/player** pitch ("earn real, dollar-pegged credits and withdraw daily; build and ship multiplayer games; get paid to play and create").

