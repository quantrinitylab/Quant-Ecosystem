# QuantChat — Search, Discovery & Recommendation Architecture

**Status:** Target-state search architecture  
**Scope:** C09 Search + ecosystem discovery + semantic retrieval + Quanty evidence retrieval.

## 1. Architecture law

Search is a disposable, authorization-aware projection.

**Source of truth → outbox/event spine → index projection → retrieval → authorization recheck → ranking → hydration → UI**

No index owns canonical content. No search result grants access.

## 2. Search surfaces

C09 consists of:
- Search Home
- Live Query
- All Results
- Messages
- People
- Communities/Channels
- Media
- Meetings
- Ecosystem
- Semantic Search
- Filters
- Result Detail
- Search Settings
- Quanty Search Assistant.

The same result contract is used across Mobile, Web, Tauri and Capacitor.

## 3. Retrieval tiers

Tier 0 — local/device search  
Tier 1 — QuantChat lexical search  
Tier 2 — authorized ecosystem projections  
Tier 3 — semantic/vector retrieval  
Tier 4 — Quanty synthesis over retrieved evidence.

E2EE message search prefers local decrypted indexes. Server search must never weaken the cryptographic model merely for convenience.

## 4. Index architecture

### Meilisearch
Use for:
- exact/lexical search
- prefix matching
- facets
- filters
- fast message/media/community lookup.

### Qdrant
Use for:
- semantic retrieval
- natural-language similarity
- meeting/topic discovery
- governed recommendation candidates.

### PostgreSQL
Use for:
- authoritative lookup
- permission-sensitive fallback
- resource/version state
- index checkpoints.

### Redis
Use for:
- short-lived suggestions
- rate limits
- query/session acceleration.

Indexes are rebuildable from authoritative state/events.

## 5. Canonical index document

Every document has:

- document_id
- source_product
- resource_ref
- entity_type
- tenant_id where applicable
- owner_ref
- title/projection
- safe searchable fields
- facets
- source_version
- authorization_epoch
- visibility state
- provenance
- updated_at
- deletion state.

Do not index:
- access tokens
- private keys
- unnecessary private profile fields
- plaintext E2EE content unless the explicit security model permits it.

## 6. Indexing pipeline

Domain transaction:
**mutation + outbox**

Then:

outbox
→ Kafka/event spine
→ search-indexer
→ normalize
→ policy-aware projection
→ Meilisearch/Qdrant
→ checkpoint.

Events:
- search.document.upsert
- search.document.delete
- search.document.visibility_changed
- search.document.reindex_requested.

Consumers are idempotent.

## 7. Authorization

Two checks are mandatory:

### Query-time
Determine which sources/scopes the user may search.

### Result-time
Reauthorize each candidate against current state.

Checks can include:
- identity
- tenant
- membership
- conversation role
- block state
- ACL
- retention
- deletion
- authorization epoch
- organization policy.

Stale index ACL data is never final authorization.

## 8. Privacy-preserving autocomplete

Autocomplete must not leak existence.

Example:
A user types a private person's name.

The system must not reveal:
- private account existence
- hidden alias
- private community
- blocked user
- confidential organization membership

unless discovery policy explicitly allows it.

Suggestions are generated only from an authorized candidate space.

## 9. Query understanding

The deterministic parser classifies:
- exact phrase
- entity lookup
- sender
- date
- conversation
- media
- meeting
- source product
- filter
- natural-language intent.

Natural-language parsing may infer structure but cannot expand permissions.

Example:

“meeting about mobile release last month”

becomes:
- entity_type = meeting
- topic = mobile release
- time_range = previous calendar month.

Ambiguous interpretation is shown before a broad scope is used.

## 10. Ranking pipeline

Ranking happens only after candidate authorization or under a design that proves unauthorized candidates cannot affect observable output.

Candidate signals:
- lexical relevance
- semantic similarity
- exact-match strength
- freshness
- user-selected filters
- source relevance
- conversation recency
- explicit user interaction signals.

Never rank by sensitive attributes or hidden/private relationships.

Do not expose raw ranking scores.

## 11. Cross-product search

Global search can query:
- QuantChat
- QuantDrive
- QuantCalendar
- QuantMail
- QuantGit.

Each source returns:
- QuantResourceRef
- source product
- safe display projection
- provenance
- freshness/version
- deep-link target
- authorization context.

Search does not copy source records into QuantChat.

## 12. Federated search deadlines

Global search uses bounded fanout.

Each connector gets:
- deadline
- query budget
- result limit
- cancellation signal.

Fast sources can return first.

A slow source must not block all healthy sources indefinitely.

The UI labels partial results when appropriate.

## 13. Result hydration

Index result:
**candidate**

Source query:
**authoritative hydration**

Before display:
- reauthorize
- verify current version
- remove revoked/deleted content
- generate safe preview.

Cached result detail must not bypass current authorization.

## 14. E2EE search

For E2EE private chats:

Preferred:
**local encrypted database → local search index**

The server can search metadata that is explicitly allowed by the privacy model.

If future encrypted-search technology is introduced, it requires:
- independent cryptographic review
- threat-model update
- explicit privacy policy
- migration plan.

No plaintext server index as a shortcut.

## 15. Semantic retrieval

Pipeline:

natural-language query
→ intent parser
→ authorized source scope
→ embeddings
→ Qdrant candidate retrieval
→ policy filtering
→ lexical/semantic rerank
→ source hydration
→ evidence-backed result.

Embedding indexes inherit the same deletion and authorization lifecycle as lexical indexes.

A vector must never survive source deletion indefinitely.

## 16. Quanty Search

Quanty sits above retrieval, not below authorization.

Modes:
- Find
- Explain
- Compare
- Navigate
- Act.

Example:

“Find unresolved action items from this week's meetings.”

Quanty must return:
- source meetings
- evidence
- dates
- provenance
- ambiguity/confidence where meaningful.

If no evidence supports a claim, Quanty must say so.

Actions such as creating tasks, sending messages or changing Calendar require their normal capability and approval flow.

## 17. Recommendation boundary

Search and recommendation are related but distinct.

Search answers:
**What matches my request?**

Recommendation answers:
**What might be useful to me next?**

Recommendation candidates may come from:
- explicit follows
- subscriptions
- recent authorized activity
- content similarity
- community relationships
- declared interests.

Do not infer sensitive characteristics.

Recommendation must honor:
- blocks
- mutes
- privacy settings
- age/safety policy where applicable
- organization boundaries
- content safety.

## 18. Discovery graph

A lightweight discovery graph may connect:
User
→ Conversation
→ Community
→ Channel
→ Media
→ Meeting
→ Artifact.

Edges are references, not copied ownership.

Graph-derived discovery remains subject to source authorization.

## 19. Search history

Search history is user data.

Store:
- normalized query where policy permits
- timestamp
- selected scope
- filters
- result interaction metadata where explicitly allowed.

Retention is configurable.

Clearing history removes search-history data, not source content.

Sensitive queries should be minimized/redacted in telemetry.

## 20. Search sessions

A search session tracks:
- query
- scope
- filters
- cursor
- source states
- partial-result state
- trace/correlation IDs.

Session state is short-lived.

Do not use it as canonical search content.

## 21. API

GET /api/v1/chat/search
GET /api/v1/chat/search/suggestions
GET /api/v1/chat/search/messages
GET /api/v1/chat/search/people
GET /api/v1/chat/search/communities
GET /api/v1/chat/search/media
GET /api/v1/chat/search/meetings
GET /api/v1/chat/search/ecosystem
POST /api/v1/chat/search/semantic
GET /api/v1/chat/search/{resultRef}
POST /api/v1/chat/search/saved
DELETE /api/v1/chat/search/saved/{savedRef}
DELETE /api/v1/chat/search/history
GET /api/v1/chat/search/preferences
PATCH /api/v1/chat/search/preferences
POST /api/v1/chat/search/reindex.

All APIs use authenticated identity, opaque cursors, bounded cost, rate limits and result authorization.

## 22. Realtime invalidation

Events:
- search.result.invalidated
- search.scope.changed
- search.document.updated
- search.indexing_status.

If a currently displayed result becomes inaccessible:
1. stop using cached authorization
2. invalidate result
3. remove it from result lists
4. if open, show unavailable/revoked state.

## 23. Offline search

Offline:
- search explicitly indexed local data
- label results as device-local
- preserve recent conversation search
- never fabricate global results
- stale cached results show freshness state.

Global semantic search requires connectivity unless an approved on-device model/index is available.

## 24. Platform architecture

### Mobile / Capacitor
- full-screen search
- keyboard-first launch
- filter sheets
- recent local results
- result preview sheets.

### Web
- command palette
- keyboard navigation
- split result/detail
- persistent filters.

### Tauri
- global hotkey
- native deep links
- larger preview
- optional local index acceleration.

### Quanty
- contextual Ask Quanty control
- evidence panel
- explicit action boundary.

## 25. Accessibility

Required:
- keyboard navigation
- semantic result roles
- screen-reader announcements
- visible focus
- result type represented by text/icon, not color alone
- readable highlighting
- reduced motion
- accessible filters
- actionable empty/error states.

## 26. Abuse and safety

Controls:
- query rate limits
- enumeration protection
- autocomplete privacy
- malicious query handling
- snippet sanitization
- prompt-injection isolation
- blocked-user enforcement
- admin search audit
- tenant isolation.

Search snippets are untrusted content and must be escaped/sanitized before rendering or model ingestion.

## 27. Failure matrix

| Failure | Result |
|---|---|
| Meilisearch unavailable | bounded authoritative fallback or degraded state |
| Qdrant unavailable | lexical search remains |
| ecosystem source unavailable | partial result with source state |
| stale index | source recheck/freshness warning |
| ACL revoked | immediate invalidation |
| deleted resource | no stale preview |
| semantic model unavailable | deterministic search |
| offline | local search only |
| connector timeout | cancel connector, preserve other results |

## 28. Observability

Measure:
- query latency
- suggestion latency
- result count
- source fanout latency
- authorization rejection rate
- stale-result invalidation
- index lag
- indexing failure
- vector retrieval latency
- semantic fallback rate
- search-to-open conversion
- zero-result rate.

Never log private query content by default when telemetry can work with hashes/categories.

## 29. Test matrix

Unit:
- parser
- filters
- ranking
- normalization
- result authorization.

Integration:
- indexing
- deletion
- ACL changes
- ecosystem routing
- semantic retrieval
- invalidation.

Security:
- IDOR
- tenant crossover
- private autocomplete leakage
- stale ACL
- malicious snippets
- prompt injection
- unauthorized deep links.

Chaos:
- index outage
- connector timeout
- event duplication
- event reordering
- index lag.

E2E:
- message → C02
- community → C04/C05
- meeting → C08
- recording → Drive
- event → Calendar
- mail → Mail
- Git resource → Git
- semantic query → evidence-backed Quanty result.

## 30. Implementation sequence

SEARCH-01 result/resource contract.
SEARCH-02 index projection pipeline.
SEARCH-03 QuantChat lexical index.
SEARCH-04 Search Home + Live Query.
SEARCH-05 messages/people/community/media.
SEARCH-06 meeting search.
SEARCH-07 ecosystem federation.
SEARCH-08 authorization/invalidation.
SEARCH-09 Qdrant semantic retrieval.
SEARCH-10 Quanty evidence retrieval.
SEARCH-11 recommendation/discovery signals.
SEARCH-12 offline/local search.
SEARCH-13 accessibility/security/performance.
SEARCH-14 rebuild/retention/chaos validation.

## 31. Architectural invariant

**Search may know where a resource is, but only the owning product decides whether the user may see or act on it.**
