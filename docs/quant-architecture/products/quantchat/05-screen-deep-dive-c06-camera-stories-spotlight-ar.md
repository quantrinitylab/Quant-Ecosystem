# QuantChat — Screen Deep Dive: C06 Camera + Stories + Spotlight + AR

C06 is the Snapchat-class visual/social surface of QuantChat. It is not a separate media app. Camera capture, ephemeral communication, Stories, Spotlight, lenses, avatars, editing and sharing remain inside the same communication graph.

## 1. Product role and UX law

C06 must feel camera-first without becoming camera-only.

Entry points: bottom navigation, composer camera, 1:1/group/community conversation, Story ring, Spotlight, QuantMeet camera/effect picker, Quanty suggestion, or ecosystem resource card.

The surface preserves the originating context. Capture is a reusable intent, not a dead-end screen.

Ownership:
- source media + media metadata: QuantChat media domain
- durable files/large recordings: QuantDrive through typed resource handoff
- identity/contact graph: Identity + Contacts
- camera permissions: operating system
- lens/effect definitions: QuantChat Lens domain
- recommendation/ranking: QuantChat discovery projection
- durable memory: governed QuantDrive memory
- meeting media: QuantChat QuantMeet subsystem
- credits/commerce: QuantTrinity economy
- moderation: QuantChat safety domain

No screen silently copies another product's source of truth.

## 2. C06 screen family

C06.1 Camera Home
C06.2 Photo Capture
C06.3 Video Capture
C06.4 Lens/AR Browser
C06.5 Media Editor
C06.6 Send Target Picker
C06.7 Story Composer
C06.8 Story Viewer
C06.9 Spotlight Feed
C06.10 Spotlight Publish
C06.11 Profile/Avatar/Lens Identity
C06.12 Media Detail/Share Sheet
C06.13 Camera Permissions & Safety
C06.14 QuantMeet Camera/Effects Panel

All screens share one capture pipeline and media state machine.

## 3. Platform-wide UI/UX

### Mobile
Full-bleed camera/vertical media, gesture-first controls, thumb-reachable actions, bottom action tray and safe-area aware controls.

Camera chrome:
- top-left: close/back
- top-center: active mode/context
- top-right: flash, camera switch, settings
- right rail: effects, flip, timer, speed, layout
- bottom-center: shutter
- bottom-left: gallery/memory
- bottom-right: destination/preview

Advanced controls open as contextual sheets; do not permanently show ten icons.

### Web
Do not render a giant phone. Use left navigation rail, center camera/media stage, right inspector, bottom timeline when editing, keyboard shortcuts and drag/drop.

Web camera supports webcam, screen/window capture, microphone and virtual background where supported.

### Tauri desktop
Use native-feeling global shortcuts, native file picker, drag/drop, high-quality device selection, virtual camera integration where available, notifications and resumable background upload.

### Capacitor mobile
Use native camera/media APIs through a thin adapter. Business rules remain shared TypeScript.

### QuantMeet
Reuse the same lens/effect runtime with meeting-safe controls: appearance, background, avatar, accessibility, reactions and collaborative effects. A meeting frame must never accidentally publish as a Story/Spotlight item.

## 4. C06.1 Camera Home

Mobile composition:
1. live camera viewport: about 78–86% of usable height
2. mode selector
3. shutter/action zone
4. compact utility rail
5. destination preview

Modes: PHOTO, VIDEO, STORY, SPOTLIGHT, MEET, LENS.

State machine:
IDLE → INITIALIZING → READY → CAPTURING → REVIEW → EDITING → DESTINATION → UPLOADING → PUBLISHED/SENT

Failures: permission denied, camera unavailable, microphone unavailable, GPU/effect unsupported, storage unavailable, upload interrupted, moderation rejected, authorization expired.

Muse is a subtle contextual spark, not a giant chatbot. It can suggest composition/effects, draft captions, translate, describe content and explain privacy. It cannot capture or publish without explicit user approval or an approved automation policy.

## 5. C06.2 Photo + C06.3 Video

Photo controls: shutter, burst, timer, aspect ratio, flash, lens, front/back, zoom.

Video controls: tap start/stop, speed, timer, stabilization, microphone source, lens/effect, resolution/FPS when supported.

Capture first creates a local MediaDraft; it is not yet a message or publication.

MediaDraft fields:
draftId, ownerId, captureContext, localAssetRef, mediaType, dimensions, duration, audioTrack, effectStack, editRevision, privacyIntent, destinationIntent, createdAt, uploadState.

## 6. C06.4 Lens / AR Browser

Lens browser is a visual shelf over live preview.

Sections: For You, Trending, Friends Used, New, Saved, Creator, Seasonal, 3D, Avatar, Accessibility, Meeting Safe.

Search by creator, effect name, tags, visual similarity or voice query.

Lens cards show live thumbnail, creator, performance tier, required permissions, save/share and credits when paid.

Runtime:
Camera Frame → Face/Body/Scene Understanding → Effect Graph → WebGL/WebGPU/Native Renderer → Compositor → Preview

Fallback:
GPU effect unsupported → reduced effect → static overlay → no-effect capture

Lens packages are sandboxed with explicit capabilities for camera, microphone, landmarks, segmentation, location only when required, and approved network APIs. Never expose arbitrary account tokens.

## 7. C06.5 Media Editor

Mobile: full-screen preview + bottom timeline.

Tools: trim, crop, rotate, speed, volume, music/audio, text, stickers, drawing, captions, filters, effects, transitions, voiceover, background, cover frame.

Desktop: left tools/assets, center preview, right inspector, bottom timeline.

Keyboard: Space play/pause, J/K/L playback, arrows for movement, Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo, Delete selected item.

Editing is non-destructive. Store an EditGraph:
Source → Crop → Color → Effects → Text → Audio → Captions → Output

Each save creates an immutable revision reference.

## 8. C06.6 Send Target Picker

Destinations: recent chats, pinned chats, groups, communities, channels, Story, Spotlight, QuantMeet, QuantDrive and ecosystem share.

Multi-select is allowed for private sends subject to policy.

Public destinations always show a visibility label: Only me / Contacts / Friends / Community / Public.

Never default a private capture to public publishing.

## 9. C06.7 Story Composer

Story states:
DRAFT → PROCESSING → PUBLISHED → EXPIRED → RETAINED/DELETED

Supports photo/video, text, collage, music, stickers, polls, questions, explicit-consent location, links/resource cards, mentions, close-friends/custom audience, replies, screenshot policy and expiry.

Audience selector: public, contacts, friends, close friends, custom, community, only me.

Blocked users are removed server-side from eligible audience.

## 10. C06.8 Story Viewer

Full-screen vertical viewer with progress segments, author header, mute, pause, reaction, reply, share, more and report.

Gestures:
- left tap: previous
- right tap: next
- hold: pause
- swipe down: close
- swipe up: details/action where enabled

Quanty can translate, explain, summarize, identify visible text or draft a reply, only within the authorized viewer session.

Owner analytics: views, unique viewers, completion, replies, reactions, shares, exits and link actions. Viewer identity follows privacy policy.

## 11. C06.9 Spotlight Feed

Mobile: full-screen vertical player with creator identity, follow, caption, sound, comments, share, save, report and remix/response where enabled.

Desktop: discovery grid + selected player + comments/context panel.

Candidate generation: followed creators, social graph, content similarity, language, region where permitted, recent interests, trend velocity and quality signals.

Ranking constraints: safety, age policy, blocks, privacy, diversity, creator fairness, frequency caps and feedback.

Raw engagement must never be the only ranking signal.

Feedback: not interested, mute creator/topic/sound, report, see fewer like this.

## 12. C06.10 Spotlight Publish

Wizard:
1. media preview
2. caption
3. cover
4. sound/audio
5. tags
6. audience
7. remix permissions
8. comments/replies
9. AI disclosure if generated/modified
10. safety scan
11. publish confirmation

Final CTA must state visibility: Publish publicly, not generic Post.

Muse can draft caption, translate, suggest title, generate accessibility description and check risky metadata. It cannot silently alter creator intent.

## 13. C06.11 Avatar + visual identity

Avatar is a first-class identity projection:
- 2D profile avatar
- 3D avatar
- expression rig
- outfit/accessory inventory
- animated reaction avatar
- meeting avatar
- AR face avatar

Identity authority remains the account identity service. Avatar assets are QuantChat visual identity resources.

Safety: impersonation reporting, verified identity badge where applicable, creator ownership, asset provenance and AI-generated avatar disclosure where required.

## 14. C06.12 Media Detail + Share Sheet

Media can be sent to chat, added to Story, published to Spotlight, attached to Calendar, attached to Mail, saved to Drive, inserted into authorized Git issue/PR, used in QuantMeet or shared as a typed ecosystem resource.

The sheet must show what is shared, with whom, and which product becomes authoritative.

Example: Save to QuantDrive means Drive owns durable file metadata; QuantChat keeps only a resource reference.

## 15. C06.13 Permissions + privacy

Distinguish camera, microphone, media library, notifications, location and local-device permissions.

State machine:
NOT_REQUESTED → REQUESTED → GRANTED / DENIED / LIMITED / BLOCKED

Do not repeatedly prompt after permanent denial. Explain exactly what is needed and provide platform Settings guidance.

Privacy center exposes camera/mic indicators, recent destinations, active sessions, Story defaults, Spotlight visibility, location use and lens permissions.

## 16. C06.14 QuantMeet camera/effects

Pre-join: camera preview, mic/speaker tests, background/effects, avatar, device selection, accessibility and network quality.

In-meeting: effects, reactions, avatar, background, captions, translation and speaker framing.

Muse appears as a subtle assistant for meeting summary state, translation, action-item extraction, speaker notes and moderation alerts. It must never cover faces, captions or critical controls.

## 17. Unified media pipeline

Capture → local draft → metadata normalization → client safety/privacy checks → encrypted upload → processing → server policy validation → moderation → publication/send transaction → event spine → projections → notifications → analytics

Large media uses object storage, resumable multipart upload, content hash, malware scan, transcoding, thumbnails/posters, adaptive bitrate packaging and signed playback URLs.

Never publish before durable acceptance.

## 18. Media state machine

LOCAL → HASHED → UPLOADING → UPLOADED → PROCESSING → MODERATION_PENDING → READY → PUBLISHED/SENT

Error branches: UPLOAD_FAILED, PROCESSING_FAILED, MODERATION_REJECTED, EXPIRED, DELETED.

Every retry uses an idempotency key.

## 19. Realtime

Realtime: upload progress, Story publish confirmation, reactions, viewer state where permitted, Spotlight comments, creator notifications and lens availability.

Durable: media metadata, Story publication, audience policy, Spotlight publication, comments, reactions as domain events and moderation actions.

Ephemeral: camera presence, live editing hints and temporary viewer presence.

Never send large media bytes through WebSocket.

## 20. Data model

Core entities:
MediaAsset, MediaDraft, MediaRevision, EditGraph, Lens, LensVersion, LensInstall, AvatarRig, Story, StoryItem, StoryAudience, StoryView, SpotlightPost, SpotlightComment, SpotlightReaction, SpotlightRankingSignal, MediaShare, MediaModerationCase, MediaProcessingJob, MediaTranscodeVariant, MediaAccessGrant.

Canonical relationship:
MediaAsset → Revision(s) → Publication(s)

One source asset can power private attachment, Story item and Spotlight publication without duplicating source bytes.

## 21. API surface

Camera/media:
- POST /v1/media/drafts
- POST /v1/media/uploads
- POST /v1/media/uploads/{id}/complete
- GET /v1/media/{id}
- POST /v1/media/{id}/revisions
- POST /v1/media/{id}/share

Lenses:
- GET /v1/lenses
- GET /v1/lenses/{id}
- POST /v1/lenses/{id}/save
- POST /v1/lenses/{id}/apply

Stories:
- POST /v1/stories
- GET /v1/stories/feed
- GET /v1/stories/{id}
- POST /v1/stories/{id}/view
- POST /v1/stories/{id}/reaction
- POST /v1/stories/{id}/reply
- DELETE /v1/stories/{id}

Spotlight:
- GET /v1/spotlight/feed
- POST /v1/spotlight
- GET /v1/spotlight/{id}
- POST /v1/spotlight/{id}/reaction
- POST /v1/spotlight/{id}/comment
- POST /v1/spotlight/{id}/not-interested
- POST /v1/spotlight/{id}/report

QuantMeet:
- GET /v1/meet/camera-config
- GET /v1/meet/effects
- POST /v1/meet/effects/session

## 22. Muse / Quanty deep integration

Muse has six deliberate UI placements:
1. Camera spark — capture/composition assistance
2. Lens copilot — effect discovery/accessibility
3. Editor copilot — edit/caption/translation
4. Story copilot — audience/caption/reply help
5. Spotlight copilot — publish quality/discovery feedback
6. Meet copilot — live meeting assistance

Each receives a minimum-useful QuantContextEnvelope.

Example context:
surface = c06.story-composer
resource = storyDraft
allowedActions = draft_caption, translate, describe

Never pass full message history or the full account graph merely because Muse is visible.

Destructive/public actions require explicit confirmation unless an approved automation policy authorizes them.

## 23. Accessibility

Required: VoiceOver/TalkBack labels, reduced motion/transparency, high contrast, large text, captions, audio descriptions where supported, haptic alternatives, keyboard navigation, no gesture-only critical action, focus restoration, screen-reader announcements for upload/publish failures.

Camera effects must not create unsafe flashing patterns.

## 24. Safety and moderation

Pipeline:
client signal → server classification → policy engine → moderation queue → decision → appeal

Signals: spam, sexual content, violence, harassment, impersonation, copyright-risk signals, dangerous challenges, privacy exposure and manipulated media.

Age/safety policy is enforced before recommendation, not only after publication.

Public media has stricter moderation than private E2EE communication. Private E2EE attachments are not silently server-scanned; public Spotlight follows its explicit moderation policy.

## 25. Performance budgets

Mobile:
- camera preview target: device-appropriate 30/60 FPS
- lens selection feedback: perceptually immediate
- first frame: progressive initialization
- upload without blocking editing
- bounded feed prefetch based on network/battery

Desktop:
- responsive camera stage during processing
- virtualized timeline tracks
- asynchronous thumbnail generation

Never block the main thread with full-resolution media processing.

## 26. Failure handling

Camera unavailable → reason + alternate upload.
Permission denied → explain exact permission and why.
Upload interrupted → resume from last confirmed multipart chunk.
Processing timeout → preserve draft and retry in background.
Moderation pending → show processing state, not silent failure.
Public publish rejected → preserve editable draft and show policy reason/appeal.
Network loss in Spotlight → preserve playback position and retry feed fetch.
Lens crash → disable only the failing lens and return to base camera.

## 27. Cross-app handoffs

QuantMail: typed attachment/resource; Mail owns email.
QuantCalendar: media/meeting reference; Calendar owns event.
QuantDrive: durable original/export; Drive owns file metadata.
QuantContacts: canonical identity for mentions/sharing.
QuantGit: authorized resource in issue/PR; Git owns repository artifact.
QuantAI: governed AI task with explicit resource scope.
QuantGram, QuantWave, QuanTube, QuantCooks and QuantAds: capability-based handoffs only; each product remains authoritative for its own publication, graph, creator state or advertising state.

## 28. Navigation graph

Inbox → Camera
1:1 → Camera → Send
Group → Camera → Group
Community → Camera → Channel/Community
Story → Camera → Story
Spotlight → Camera → Spotlight
Meet → Camera → Meet
Media Detail → authorized ecosystem target

Back navigation restores originating surface and scroll position.

## 29. Screen completion checklist

Every C06 screen requires responsive mobile UI, responsive web UI, Tauri behavior, Capacitor/native behavior, loading/empty/error states, accessibility, permissions, offline/degraded behavior, telemetry, security, authorization, media lifecycle, moderation lifecycle, Quanty placement, cross-app handoffs, tests and performance evidence.

## 30. Muse implementation sequence

C06-A: camera shell + platform adapters + permission state machine.
C06-B: MediaDraft + resumable upload + processing.
C06-C: lens runtime + browser + safe fallback.
C06-D: editor + non-destructive EditGraph.
C06-E: Story composer/viewer + audience controls.
C06-F: Spotlight feed/publish + ranking contracts.
C06-G: avatar/visual identity.
C06-H: QuantMeet camera/effects.
C06-I: Quanty placement + capability authorization.
C06-J: cross-app handoffs + notifications + memory projections.
C06-K: accessibility/performance/security hardening.
C06-L: runtime evidence, tests and Definition-of-Done review.

Next deep slice: C07 Calls — 1:1 voice/video, group calls, escalation into QuantMeet, device routing, network adaptation, recording boundaries, captions, speaker state, Quanty and all-platform UI.
