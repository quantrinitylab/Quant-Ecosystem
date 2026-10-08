# QuantChat — Media, Content Processing & Safety Architecture

**Status:** Target-state build contract  
**Scope:** C06 media, Stories, Spotlight, AR assets, QuantMeet recordings and server-readable media processing.

## 1. Architectural law
QuantChat media is a governed resource lifecycle, not a file-upload feature. Bytes, authorization, publication, safety, delivery and retention are separate contracts.

QuantChat owns media metadata, attachment relations, publication state and media policy. Object storage owns bytes. QuantDrive owns durable file metadata after an explicit handoff. Other products receive typed resource references rather than copied records.

## 2. Media classes
- `private_e2ee_attachment` — encrypted before upload; server cannot inspect plaintext.
- `private_server_readable_attachment` — server processing is allowed by explicit product policy.
- `ephemeral_story` — expiry-bound publication.
- `public_spotlight` — public media subject to publication and safety policy.
- `community_media` — visibility controlled by community/channel authorization.
- `voice_note` — chat audio.
- `call_recording` / `meet_recording` — explicit recording capability and retention policy.
- `lens_package` — sandboxed visual asset package.
- `avatar_asset` — identity projection.
- `generated_media` — AI-generated or materially modified media with provenance metadata.

## 3. End-to-end lifecycle
```text
capture/import → MediaDraft → local validation → content hash → upload intent
→ resumable R2 upload → completion verification → processing
→ validation / malware scan / metadata policy / derivatives / safety signals
→ policy decision → READY or QUARANTINED or REJECTED
→ send/publication → event spine → projections → signed delivery
→ retention / expiry / deletion
```

Upload completion is never equivalent to publication approval.

## 4. Upload architecture
Client first creates a MediaDraft and upload intent. The server validates actor, tenant, destination, capability, quota, size limits, encryption mode and retention intent.

Large objects upload directly to R2 through short-lived scoped multipart credentials. The API does not proxy media bytes.

Upload grants are bound to an opaque object/upload id, maximum bytes, allowed type family, expiration, tenant/resource and checksum requirements.

Multipart state is recorded locally and resumes from confirmed parts after network/background interruption. Completion is idempotent.

Failure states include `UPLOAD_INIT_FAILED`, `PART_FAILED`, `NETWORK_LOST`, `EXPIRED` and `HASH_MISMATCH`.

## 5. E2EE boundary
For private E2EE attachments, encryption happens before upload:
`plaintext → client encryption → ciphertext object → R2 → authorized ciphertext delivery → recipient decrypts locally`.

Server-side thumbnailing, transcription, OCR or content classification must not silently inspect E2EE plaintext.

Permitted alternatives are client-side processing, recipient-device processing, or an explicit narrow plaintext handoff to a governed AI action. Admin privileges do not bypass this boundary.

## 6. Server-readable processing pipeline
### Stage A — structural validation
- magic-byte/content-type verification
- container parser validation
- actual-size and declared-size comparison
- image pixel/dimension limits
- video duration/frame limits
- audio limits
- bounded archive/container recursion
- decompression-bomb protection.

Never trust an extension or client MIME string.

### Stage B — malware/security scan
Server-readable files are scanned before publication where policy requires it. Suspicious objects enter quarantine and are removed from ordinary delivery paths.

Scanner failure is fail-closed for publication paths that require a clean verdict.

### Stage C — metadata normalization
Public derivatives may strip privacy-sensitive metadata such as GPS and device identifiers. Original metadata is retained only when the source retention policy requires it.

### Stage D — derivative generation
Generate only required derivatives: thumbnails, posters, responsive images, waveforms, captions, adaptive video renditions and editor previews.

Derivatives are immutable generations. They inherit authorization and retention constraints from their source unless an explicit publication creates a new scope.

## 7. Image processing
`decode sandbox → dimension limits → orientation/color normalization → metadata policy → resize/encode → thumbnail → fingerprint`.

Bounded decoders reject pathological pixel counts before full allocation.

## 8. Video processing
`probe → validate → security scan → sandboxed decode → metadata normalization → transcode ladder → poster → captions → package → integrity check → publish`.

Initial compatibility should prioritize widely supported H.264/AAC MP4 and adaptive streaming. Additional codecs are added from measured device/CDN coverage.

Transcode identity is based on `(source_hash, profile, processor_version)`. Never overwrite active derivatives in place.

## 9. Audio processing
Voice notes and audio use container validation, duration/size limits, waveform generation and optional authorized transcription.

Transcript is a derived resource with its own access policy. It is not automatically written to durable QuantDrive memory.

## 10. QuantMeet recordings
Recording is an explicit capability. Before recording, meeting policy, actor capability, participant notice/consent requirements and retention policy must resolve successfully.

Pipeline:
`SFU/recording worker → encrypted staging → segment validation → mux → captions/transcript → thumbnails → policy decision → QuantDrive handoff → signed playback`.

QuantMeet owns meeting/session context. QuantDrive owns the durable recording resource after a successful typed handoff.

## 11. Stories
Required state machine:
`DRAFT → PROCESSING → SAFETY_PENDING → READY → PUBLISHED → EXPIRED → TOMBSTONED`.

Expiry is enforced at authorization time, not only by a cleanup job. Cleanup is eventually consistent; visibility is not.

Legal hold or an active safety case can pause destruction only through an explicit audited policy.

## 12. Spotlight
Spotlight uses the stricter public pipeline:
`upload → structural validation → security scan → privacy metadata policy → derivatives → safety signals → policy engine → review when required → publication → recommendation eligibility`.

Publication eligibility and recommendation eligibility are separate. A creator can have a visible post that is temporarily excluded from recommendation.

Ranking only consumes policy-filtered content.

## 13. Safety decision architecture
Safety is a multi-signal decision system, not a single model score.

Signal families include spam/automation, harassment, violence, dangerous activity, impersonation/deceptive identity, privacy exposure, manipulated media and other product policy categories.

Classifier output is evidence, not final authority:
`classifier → policy engine → risk tier → automated action or human review`.

High-impact actions record policy version, signal/model version, reason code and appeal state.

## 14. Severe-safety evidence handling
Sensitive safety cases use least-privilege access, isolated evidence storage, immutable audit records, restricted operator roles, jurisdiction-aware escalation and explicit retention policy.

Private E2EE content is never silently moved into a server-scanning path. Content class and cryptographic boundary determine what can technically be inspected.

## 15. Fingerprints and duplicate detection
Keep separate:
- cryptographic hash = byte identity
- perceptual fingerprint = similarity signal
- moderation evidence = policy interpretation.

Similarity is never treated as proof by itself. Fingerprint algorithm/version is recorded.

## 16. Quarantine and review
Quarantine is a first-class state:
`CLEAR → QUARANTINED → REVIEWING → RELEASED | REJECTED | ESCALATED`.

Quarantined objects are unavailable through normal CDN paths.

Operator view contains case id, resource ref, policy reason, evidence summary, model/version, authorized history and allowed actions. It does not grant unrestricted access to private message plaintext.

Every moderation action records actor, capability, policy version, evidence refs, resource refs, previous state, new state, reason and trace id. Appeals create new decisions instead of rewriting history.

## 17. AR/Lens asset safety
Lens packages are untrusted assets. Validate signed manifests, supported runtime, declared capabilities, package size, dependency allowlist, shader/resource limits, network policy and camera/microphone/location permissions.

Arbitrary native code and arbitrary account-token access are forbidden.

Runtime failure isolates the lens instead of crashing the camera.

## 18. CDN and delivery
Delivery path:
`authorized API → short-lived access grant → signed CDN/object URL → edge → object storage`.

Rules:
- no permanent public paths for protected media
- bounded signed URL lifetime
- audience policy checked before grant issuance
- revoked publication stops new grants
- cache keys cannot bypass authorization
- sensitive/private derivatives use restrictive cache policy.

## 19. Offline media
Offline downloads create encrypted local references, not permanent server grants.

Before playback/use, the client verifies authorization, expiry/revocation and integrity. E2EE downloads remain encrypted at rest.

Under storage pressure, regenerateable derivatives are removed before protected source material.

## 20. Retention and deletion
Deletion state:
`DELETE_REQUESTED → ACCESS_REVOKED → TOMBSTONED → DERIVATIVES_RETIRED → OBJECT_GC_ELIGIBLE → DESTROYED`.

Access revocation is immediate. Physical object deletion can be asynchronous.

Every derivative points to its source generation so cleanup can verify that no public derivative survives its source policy.

## 21. Job architecture
Every processing job stores job id, source resource, processor, processor version, input generation, idempotency key, attempts, deadline, error class and output refs.

Workers are restart-safe. A crash cannot create a half-published resource.

BullMQ/Redis may handle bounded operational jobs; Kafka carries durable domain facts. PostgreSQL remains the queryable job/domain state.

DLQs are bounded, observable and replayable by resource/case scope.

## 22. Events
Recommended events:
- `chat.media.upload_completed.v1`
- `chat.media.processing_started.v1`
- `chat.media.derivative_ready.v1`
- `chat.media.safety_decision.v1`
- `chat.media.quarantined.v1`
- `chat.media.published.v1`
- `chat.media.unpublished.v1`
- `chat.media.expired.v1`
- `chat.media.deleted.v1`
- `chat.media.recording_handoff_completed.v1`.

Events contain typed resource references and provenance, never unnecessary media bytes or E2EE plaintext.

## 23. API additions
- `POST /v1/media/drafts`
- `POST /v1/media/uploads`
- `POST /v1/media/uploads/{id}/complete`
- `GET /v1/media/{id}`
- `GET /v1/media/{id}/status`
- `POST /v1/media/{id}/revisions`
- `POST /v1/media/{id}/access-grants`
- `DELETE /v1/media/{id}`
- `GET /v1/media/{id}/derivatives`
- `GET /v1/media/{id}/moderation-status`
- `POST /v1/media/{id}/appeals`.

Admin/safety endpoints remain capability-gated and product-owned.

## 24. Screen-by-screen impact
### C06.1 Camera Home
Show local readiness and upload capacity. Do not block camera startup on server moderation. Muse suggests capture improvements without publishing.

### C06.5 Media Editor
Separate local processing progress from upload progress. Failed derivative generation preserves the editable source draft.

### C06.7 Story Composer
Explicit audience and expiry. Safety-processing state is visible before publish.

### C06.8 Story Viewer
Expired/revoked media returns a policy state instead of stale cached playback.

### C06.9 Spotlight
Publication state and recommendation eligibility are shown as separate concepts.

### C06.10 Spotlight Publish
CTA states visibility. AI-modification disclosure appears when applicable. Rejection preserves the draft and appeal path.

### C06.13 Permissions
Camera, microphone and media-library permissions are separate with contextual explanations.

### C08 QuantMeet
Recording state is visible to participants when required. Post-meeting status distinguishes local capture, processing and durable Drive handoff.

### C13 Admin
Operators see case/resource state and capability-scoped actions, not generic storage-admin powers.

## 25. Platform behavior
**Mobile/Capacitor:** background upload, native picker, hardware codec preference, battery/storage awareness and encrypted local cache.

**Web:** drag/drop, resumable uploads, worker-based preview work and browser permission boundaries.

**Tauri:** native file picker, background transfers, hardware acceleration and larger editing workspace.

**QuantMeet:** latency-sensitive camera path; recording is asynchronous and durable.

## 26. Quanty/Muse integration
Six useful placements:
1. capture spark
2. editor copilot
3. publication copilot
4. safety explanation
5. meeting media copilot
6. cross-app media handoff assistant.

Each receives a minimum-useful `QuantContextEnvelope` containing only the current resource, authorized metadata and declared actions.

Quanty cannot silently publish, expose protected media, bypass safety policy or decrypt E2EE content.

## 27. Cross-app integration
QuantDrive owns durable originals/exports/recordings after explicit handoff.
QuantMail owns email state.
QuantCalendar owns event state.
QuantGit owns repository artifacts.
QuantGram owns its publication/creator state.
QuantWave owns audio catalog/creator state.
QuanTube owns video/channel state.
QuantAds owns campaign/creative approval state.

All cross-app transfers use typed resource/context contracts. Failures must not create duplicate bytes or phantom publications.

## 28. Security and failure drills
Threats include malicious containers, spoofed MIME, decompression bombs, poisoned lens assets, leaked signed URLs, cache authorization bypass, worker compromise, cross-tenant access and stale publication after revocation.

Controls include sandboxed parsers, least-privilege identities, tenant-bound object keys, short-lived grants, immutable processing generations, isolated workers, audit/provenance and authorization at both publication and delivery boundaries.

Failure drills must cover worker restart, duplicate events, Kafka replay, Redis outage, storage timeout, scanner outage, transcode timeout and interrupted multipart upload.

## 29. Observability
Every processing hop carries trace/correlation/resource ids.

Measure upload success/resume rate, processing latency, queue depth, transcode failures, scanner availability, safety latency, quarantine volume, appeal rate, CDN hit rate, playback startup, recording handoff success and deletion lag.

Alert on safety-pipeline outage, queue growth, cross-tenant authorization errors, publication without required safety decision, storage errors and stale revocation.

## 30. Performance and accessibility
Keep camera preview at device-appropriate 30/60 FPS. Keep uploads off the UI thread. Generate thumbnails asynchronously. Use bounded feed prefetch based on battery/data. Preserve low-bandwidth and low-storage modes.

Screen readers must announce upload, processing, publish and failure states. Reduced motion must disable unsafe/overwhelming effects. Critical media actions cannot be gesture-only.

## 31. Test matrix
Unit: state transitions, idempotency, audience policy, retention and signed grants.

Integration: multipart completion, processing pipeline, quarantine/release, Story expiry, CDN authorization and recording handoff.

Security: MIME spoofing, malformed containers, decompression bombs, cross-tenant access, expired/revoked grants, cache poisoning, lens capability escape and E2EE leakage.

Reliability: worker crash/restart, duplicate delivery, event replay, dependency outage and network interruption.

UX: TalkBack/VoiceOver, keyboard editor, reduced motion, low bandwidth, low storage and denied permissions.

## 32. Implementation sequence
**MEDIA-01** — MediaAsset/MediaDraft schema, refs and lifecycle.
**MEDIA-02** — signed R2 multipart upload/resume.
**MEDIA-03** — validation, checksum and parser sandbox.
**MEDIA-04** — malware scan and quarantine.
**MEDIA-05** — image/audio derivatives and privacy metadata.
**MEDIA-06** — video transcode/package/poster/captions.
**MEDIA-07** — Story publication/expiry.
**MEDIA-08** — Spotlight safety/publication.
**MEDIA-09** — fingerprints and duplicate signals.
**MEDIA-10** — moderation cases, appeals and audit.
**MEDIA-11** — lens/avatar validation.
**MEDIA-12** — QuantMeet recording + QuantDrive handoff.
**MEDIA-13** — signed CDN delivery, revocation and retention GC.
**MEDIA-14** — Quanty media tools/capabilities.
**MEDIA-15** — cross-app resource handoffs.
**MEDIA-16** — chaos/security/accessibility/performance evidence.

## 33. Definition of done
Media is complete only when ownership is explicit, upload is resumable/idempotent, processing is restart-safe, E2EE boundaries are preserved, server-readable media follows policy, delivery is authorization-bound, Story expiry works, moderation is auditable, derivatives inherit access/retention, recordings have explicit policy and durable handoff, cross-app refs do not duplicate ownership, and Quanty operates only through declared capabilities.

> **Architectural invariant:** QuantChat media is a governed resource lifecycle connected by typed resource references and durable events—not a generic file bucket.

Next deep slice: **QuantChat Bots + Mini Apps + Integrations** — bot identity, permissions, Telegram-style bots, Discord-style apps, web-app surfaces, commands, webhooks, sandboxing, OAuth scopes, Quanty tools, credits, community installation, moderation and cross-app actions.