# QuantChat C09 — Search Deep Screen Architecture

**Status:** Target-state architecture / implementation contract  
**Scope:** C09 Search inside QuantChat  
**Product law:** Search is a governed discovery projection. It is never a second source of truth.

## 0. Search thesis

C09 must feel like one search surface across the user's Quant digital life while respecting ownership, authorization, retention and privacy.

Search can discover:
- QuantChat conversations
- messages
- groups
- communities
- channels
- people/contact projections
- stories/media where searchable
- meeting references
- QuantDrive artifacts
- QuantCalendar events
- QuantMail references
- QuantGit references
- Quanty-derived results when explicitly requested

But every result carries a typed source identity and policy boundary. Search does not copy another product's database into QuantChat.

Core pipeline:

user intent -> query understanding -> authorization -> source routing -> lexical/vector retrieval -> ranking -> policy filter -> result hydration -> UI projection.

No unauthorized result may appear merely because it exists in an index.

---

# 1. C09 screen inventory

| Screen | Purpose |
|---|---|
| C09.1 Search Home | global entry, recent searches, scoped shortcuts |
| C09.2 Live Query | query input, suggestions, source tabs |
| C09.3 All Results | unified ranked result stream |
| C09.4 Messages | message-focused search |
| C09.5 People | people/contact discovery |
| C09.6 Communities & Channels | social-graph discovery |
| C09.7 Media | photos, videos, files, links |
| C09.8 Meetings | meeting messages, titles, artifacts and references |
| C09.9 Ecosystem Results | Drive/Calendar/Mail/Git authorized references |
| C09.10 Semantic Search | natural-language / intent search |
| C09.11 Search Filters | source, date, person, room, type, attachment, privacy scope |
| C09.12 Result Detail | contextual preview + safe deep link |
| C09.13 Search Settings | history, indexing/privacy controls |
| C09.14 Quanty Search Assistant | optional governed natural-language search actions |

---

# 2. C09.1 Search Home

## Mobile
- Search field dominates the top of the screen.
- Recent searches are local/account-scoped projections.
- Shortcut chips: Messages, People, Media, Communities, Meetings, Files.
- A compact "Search your Quant ecosystem" action opens the governed global scope.
- Search history can be cleared without deleting source content.

## Web/Tauri
- Large command-palette-like search surface.
- Keyboard shortcut opens search globally.
- Recent and suggested queries appear below.
- Scope selector is visible before a query becomes broad.

## Muse placement
Muse is not a permanent floating bubble.
- A subtle "Ask Quanty" action sits beside the search field.
- It is clearly distinct from deterministic search.
- It explains when semantic interpretation is being used.

---

# 3. C09.2 Live Query

Input behavior:
- debounce suggestions
- spelling normalization
- exact phrase support
- quoted phrase search
- participant/entity suggestions
- scope suggestions
- recent search suggestions
- filter chips

Example intent classes:
- exact message
- person lookup
- conversation lookup
- media lookup
- meeting lookup
- ecosystem artifact lookup
- natural-language request

Search suggestions must not leak private names or result existence to unauthorized users.

---

# 4. C09.3 All Results

Unified result card contract:

- source icon/type
- title/snippet
- author/participant projection
- timestamp
- source product
- privacy scope
- matched terms/highlight
- optional attachment preview
- safe deep link
- relevance explanation only when useful

Results are grouped when grouping improves comprehension:
Messages, People, Communities, Media, Meetings, Ecosystem.

Do not expose internal ranking scores.

---

# 5. C09.4 Messages

Message search supports:
- exact phrase
- sender
- conversation
- date range
- attachment
- link
- reaction
- unread
- thread
- channel
- encrypted/private scope

For encrypted message search:
- never weaken message encryption merely to make server search easier.
- use authorized device-side indexing or a privacy-preserving search architecture appropriate to the final E2EE design.
- server indexes must not contain plaintext private message content unless the chosen security model explicitly permits it.

Result opens the original conversation at the relevant message and preserves authorization.

---

# 6. C09.5 People

People search uses the canonical Contacts/Identity projection.

Searchable:
- display name
- allowed aliases
- verified handles
- organization/workspace membership where authorized

Not searchable by default:
- private contact fields
- hidden phone/email data
- blocked-user information
- security metadata

Person result actions:
- open profile
- message
- call
- Meet
- add/contact action when authorized.

Search must respect block, privacy and organization boundaries.

---

# 7. C09.6 Communities & Channels

Discovery modes:
- my communities
- joined
- discoverable public
- channels
- roles/permissions

Private community/channel existence must not be revealed through suggestion or zero-result timing side channels.

Result actions are capability-dependent:
- open
- join/request
- follow
- message
- start Meet
- share resource

---

# 8. C09.7 Media

Media filters:
- photo
- video
- audio
- document
- link
- shared-by
- date
- conversation
- meeting

Media previews are policy-filtered and signed/temporary where required.

The search index stores metadata needed for discovery, not unnecessary media bytes.

QuantDrive artifacts can appear only through authorized resource references.

---

# 9. C09.8 Meetings

Search can find:
- meeting title
- participant projection
- associated conversation
- meeting date
- retained transcript
- retained recording metadata
- whiteboard artifact
- decisions/actions from derived recap

Important ownership:
- meeting session metadata -> QuantChat
- calendar event -> QuantCalendar
- recording/transcript artifact -> QuantDrive
- AI recap -> governed derived output

If a transcript is not retained, search must not imply it exists.

---

# 10. C09.9 Ecosystem Results

Global search can route authorized queries to:
- QuantDrive
- QuantCalendar
- QuantMail
- QuantGit

Each connector returns a typed result envelope containing:
- resource ref
- source app
- display projection
- permission context
- provenance
- safe deep link
- freshness/version information where available

QuantChat search does not write back into those products just because a result was opened.

---

# 11. C09.10 Semantic Search

Semantic search converts natural language into a structured intent.

Example:
"Find the meeting where we discussed the mobile release last month."

Execution:
1. parse intent
2. resolve time range
3. identify authorized meeting/chat sources
4. retrieve candidates
5. rerank
6. filter by policy
7. present evidence-backed results

The semantic layer must not invent an answer when no source supports it.

For ambiguous intent, show the interpreted scope before broadening access.

---

# 12. C09.11 Search Filters

Filter model:

scope
source
content type
person
conversation
community
meeting
date
attachment
link
unread
privacy
sort

Filters are URL/deep-link serializable where safe.

A saved search stores query/filter configuration, not copied source records.

---

# 13. C09.12 Result Detail

Result detail is a projection with:
- source identity
- context
- matched evidence
- preview
- permissions
- open action
- copy/share where authorized
- report action where applicable

The deep link must resolve through the owning product's route.

Deleted/revoked resources show a clear unavailable state rather than stale cached content.

---

# 14. C09.13 Search Settings

Controls:
- search history
- clear history
- personalization
- semantic search opt-in/policy
- device-local index settings
- connected ecosystem scopes
- privacy explanation
- indexing status
- data deletion/reindex request

Clearing search history does not delete source content.

---

# 15. C09.14 Quanty Search Assistant

Quanty is an optional orchestration layer over search.

Modes:
1. Find — locate resources.
2. Explain — summarize retrieved evidence.
3. Compare — compare authorized resources.
4. Navigate — open the correct source.
5. Act — only after explicit confirmation for consequential actions.

Example:
"Find all unresolved action items from this week's meetings."

Quanty should return:
- source meetings
- action-item evidence
- provenance
- dates
- confidence/ambiguity where meaningful
- optional follow-up action.

It must not silently create tasks, send messages or modify records.

---

# 16. Search architecture

## Retrieval tiers

Tier 0: exact local/device index  
Tier 1: QuantChat authorized lexical index  
Tier 2: ecosystem source projections  
Tier 3: vector/semantic retrieval  
Tier 4: Quanty synthesis over already-authorized evidence

Ranking must happen after authorization filtering, or the system must prove that unauthorized candidates cannot affect observable output.

Recommended infrastructure:
- Meilisearch for lexical/faceted search
- Qdrant for governed semantic retrieval
- PostgreSQL for source-of-truth queries
- Redis for short-lived suggestion/rate-limit state
- Kafka/event spine for index updates

Search index is disposable. Rebuild must be possible from authoritative source events/snapshots.

---

# 17. Indexing pipeline

source mutation
-> transactional outbox
-> event spine
-> search-indexer
-> normalization
-> authorization-aware document projection
-> Meilisearch/Qdrant
-> version checkpoint.

Events:
search.document.upsert
search.document.delete
search.document.visibility_changed
search.document.reindex_requested

Deletion/revocation must propagate to indexes. A revoked resource cannot remain discoverable indefinitely because of stale indexing.

---

# 18. Authorization model

Search authorization has two layers:

1. Query-time authorization
2. Result-time authorization

Required checks:
- user identity
- tenant/workspace
- membership
- conversation role
- block/privacy policy
- resource ACL
- retention/deletion status
- legal/safety policy where applicable

Never trust the index's old ACL snapshot as the final permission decision.

---

# 19. Data model

QuantChat-owned:
- SearchQuery
- SearchHistoryItem
- SearchPreference
- SearchSavedQuery
- SearchSession
- SearchTelemetry

Index document projection:
- documentId
- sourceApp
- resourceRef
- entityType
- title
- safeSnippet
- searchableFields
- facets
- visibilityVersion
- sourceVersion
- updatedAt
- provenance

Do not store:
- raw secrets
- authentication tokens
- unnecessary private fields
- cross-product canonical records as local truth.

---

# 20. API contract

GET /api/search
GET /api/search/suggestions
GET /api/search/messages
GET /api/search/people
GET /api/search/communities
GET /api/search/media
GET /api/search/meetings
GET /api/search/ecosystem
POST /api/search/semantic
GET /api/search/:resultId
POST /api/search/saved
DELETE /api/search/saved/:id
DELETE /api/search/history
GET /api/search/preferences
PATCH /api/search/preferences
POST /api/search/reindex

Every endpoint requires:
- authenticated identity
- scope validation
- pagination/cursor
- bounded query cost
- rate limiting
- structured errors
- telemetry
- authorization checks.

Semantic search additionally requires:
- explicit scope
- evidence references
- bounded source count
- model/tool policy.

---

# 21. Realtime behavior

Search is mostly request/response, but projections change asynchronously.

Realtime events:
search.indexing_status
search.saved_query.updated
search.result.invalidated
search.scope.changed

If a result becomes inaccessible while the user is viewing it:
- remove it from live result lists
- show a stale/revoked state if already open
- never continue displaying unauthorized cached content.

---

# 22. Offline behavior

Offline:
- local search remains available for explicitly indexed local data
- clearly label results as device-local
- no fake global results
- queued history mutations are optional and retry-safe
- global search shows unavailable state
- stale cached results require freshness labeling

Mobile should optimize for recent local conversations and media metadata.

---

# 23. Mobile / Web / Tauri / Capacitor UX

Mobile/Capacitor:
- full-screen search
- keyboard-first launch
- filter bottom sheets
- swipe-back preserves query
- result preview sheets

Web:
- command palette
- keyboard navigation
- split result/detail view
- persistent filters

Tauri:
- global hotkey
- native app switching/deep links
- larger result preview
- optional local index acceleration

All platforms share:
- same capability model
- same resource references
- same authorization semantics
- same result schema
- platform-specific rendering only.

---

# 24. Accessibility

- keyboard navigation
- screen-reader result announcements
- visible focus
- semantic headings
- result type not conveyed by color alone
- highlighted terms remain readable
- reduced motion
- large touch targets
- accessible filter controls
- empty/error states with actionable text.

---

# 25. Safety and privacy

Required:
- blocked-user filtering
- private scope isolation
- no autocomplete leakage
- query logging minimization
- sensitive-query redaction in telemetry
- abuse/rate limits
- safe snippet generation
- deletion propagation
- tenant isolation
- audit for administrative search access

Search history is user-controlled data with its own retention policy.

---

# 26. Failure matrix

| Failure | Behavior |
|---|---|
| Meilisearch unavailable | fallback to authoritative limited query or explicit degraded state |
| Qdrant unavailable | lexical search continues |
| source connector unavailable | show source unavailable, preserve other results |
| stale index | freshness warning / authoritative recheck |
| permission revoked | remove/invalidate result |
| deleted source | no stale preview |
| semantic model unavailable | deterministic search remains |
| query too expensive | bounded result + actionable refinement |
| network offline | local search only |
| malformed query | normalized error, no crash |

---

# 27. Performance targets

Measured targets:
- suggestions feel immediate on normal network
- first result page streams/appears without blocking on every source
- large result sets use cursor pagination
- search index documents stay compact
- semantic retrieval is bounded
- cross-source fanout has deadlines
- slow source cannot block healthy sources indefinitely
- UI virtualizes long result lists

No production performance claim without benchmark evidence.

---

# 28. Test matrix

Unit:
- query parsing
- filters
- ranking
- result normalization
- resource refs
- authorization decisions

Integration:
- message search
- people search
- community search
- media search
- meeting search
- ecosystem routing
- deletion propagation
- ACL changes

Security:
- private result leakage
- blocked-user leakage
- tenant crossover
- stale ACL
- query injection
- semantic prompt injection
- malicious snippets
- unauthorized deep links

Realtime:
- invalidation
- reindex
- visibility change
- duplicate/out-of-order events

Accessibility:
- keyboard-only
- screen reader
- mobile touch
- high contrast
- reduced motion

E2E:
- search message -> open C02
- search community -> open C04/C05
- search meeting -> open C08
- search recording -> Drive
- search calendar event -> Calendar
- search mail -> Mail
- search Git issue/PR -> Git
- semantic search -> evidence-backed Quanty result.

---

# 29. Muse implementation sequence

C09-A: search domain, result schema and resource refs.
C09-B: QuantChat lexical indexing.
C09-C: C09 Home + Live Query.
C09-D: Messages/People/Community/Media scopes.
C09-E: Meeting search.
C09-F: ecosystem source routing.
C09-G: authorization and invalidation hardening.
C09-H: semantic retrieval with Qdrant.
C09-I: Quanty search assistant.
C09-J: mobile/Web/Tauri polish.
C09-K: accessibility, security and performance hardening.

Every slice must inspect current code first, preserve existing behavior, add tests, run affected validation, inspect UI/runtime behavior and record remaining gaps.

---

# 30. C09 definition of done

C09 is complete only when:
- all listed screens have responsive UI contracts
- search results never bypass source authorization
- indexes are rebuildable
- deletion/revocation propagates
- E2EE/private search design does not weaken message security
- ecosystem results remain typed references
- semantic search is evidence-backed
- Quanty actions require explicit capability/confirmation
- mobile/Web/Tauri/Capacitor share one contract
- accessibility, abuse and privacy controls are implemented
- performance is measured
- no fake results are used.

## C09 architectural invariant

**Search is a disposable, authorization-aware projection over the ecosystem; the source of truth always remains with the owning product.**
