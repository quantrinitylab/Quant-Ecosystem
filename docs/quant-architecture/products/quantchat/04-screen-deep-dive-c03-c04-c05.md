# QuantChat — Screen Deep Dive: C03 Group + C04 Community + C05 Channel

> Unified community architecture: WhatsApp Groups/Communities + Telegram Groups/Supergroups/Channels + Discord Servers/Channels/Roles + QuantMeet stages/spaces.

## 1. Core architectural decision
C03, C04 and C05 are three presentation surfaces over one Community Graph domain. Do not create separate WhatsAppGroup, TelegramGroup, DiscordServer and QuantMeetStage persistence models.

Canonical hierarchy:
Community → Space/Category → Channel → Thread → Message
Voice/meeting spaces attach to a Space or Channel and create a QuantChat meeting/call session.

Communication remains owned by QuantChat. Identity/Contacts, Calendar, Drive, Git and other products remain external authorities.

---

# C03 — Group Conversation

## 2. Product role
C03 is optimized for private or invite-controlled groups. It supports small/medium groups, large groups, polls, files, replies, calls, meetings, shared media and group administration.

Supported modes:
- private group
- invite-only group
- discoverable group where policy permits
- community-linked group
- temporary meeting group

## 3. Route and deep links
/chat/group/{conversationId}
Deep link: quant://chat/group/{conversationId}
Authorization is evaluated before membership data is rendered.

## 4. Header
Avatar/banner, group name, member count, search, voice call, video call, QuantMeet, more.
More: members, permissions, media/files/links, pinned messages, notification policy, disappearing policy, invite, report, leave, admin tools.

## 5. Group timeline
Same canonical Message model as C02.
Additional group-specific renderers:
- mention chips
- role badges where configured
- polls
- join/leave events
- pinned-message events
- admin announcements
- shared resource cards
- meeting cards.

## 6. Membership state machine
INVITED → PENDING → ACTIVE.
ACTIVE → MUTED / RESTRICTED / LEFT / REMOVED / BANNED.
An invitation is not membership until the server confirms acceptance.

## 7. Group roles
Use capability bundles rather than hard-coded admin flags.
Example capabilities:
view, send, reply, react, attach, mention, pin, delete_own, delete_any, invite, remove_member, manage_roles, manage_settings, start_call, start_meeting, manage_moderation, manage_bots.

Effective permission:
principal → membership → role grants → channel overrides → policy constraints → final capability set.

Explicit deny must be able to override a broad allow where policy requires it.

## 8. Group settings
- title/avatar
- description
- permissions
- member approval
- invite links
- message retention
- disappearing messages
- media permissions
- call/meeting permissions
- bot permissions
- moderation policy
- notification defaults.

Settings changes use optimistic concurrency/version checks and produce auditable events.

## 9. Large-group architecture
For high-volume groups:
- virtualized timeline
- cursor pagination
- partitioned message streams
- bounded fanout
- unread counters as projections
- asynchronous search indexing
- member list pagination
- presence aggregation instead of per-user fanout.

Never make a message transaction synchronously update every member's inbox row.

## 10. Group calls
Group call begins in C03 and may escalate to QuantMeet.
Call/session metadata belongs to QuantChat. Media travels through WebRTC/SFU, not the message service.

## 11. Group Quanty
Quanty may summarize selected periods, extract decisions, create polls, draft announcements, identify unanswered questions and prepare meetings.
Moderator actions require moderator capability and, for destructive actions, explicit approval/policy.

---

# C04 — Community / Server Home

## 12. Product role
C04 is the top-level social/community container. It unifies:
- WhatsApp Communities
- Telegram supergroups/channels
- Discord servers
- QuantChat social communities
- QuantMeet stage/event spaces.

The UI must feel like one product rather than four modes.

## 13. Community route
/chat/community/{communityId}
Deep link: quant://chat/community/{communityId}

## 14. Desktop layout
Left: community switcher.
Middle-left: category/channel tree.
Center: selected channel or community landing page.
Right: members/events/Quanty/context panel.

Community landing page includes:
- banner/avatar
- description
- rules
- announcements
- recommended channels
- upcoming events/Meet rooms
- member highlights
- discovery/search.

## 15. Mobile layout
Community header → announcements → category/channel accordion → upcoming events → selected channel.
Long channel trees use virtualization/lazy expansion.

## 16. Unified Community Graph
Canonical entities:
- Community
- Space
- Channel
- Membership
- Role
- PermissionBinding
- Invitation
- Subscription
- Thread
- MeetingSpace.

Channel types:
- text
- announcement
- forum
- media
- stage
- voice
- meeting
- live/event.

A WhatsApp-style group is a Community with a default Space/Channel projection.
A Telegram-style supergroup maps to a Community + discussion channel(s).
A Telegram-style broadcast channel maps to an announcement channel.
A Discord server maps to Community + categories/Spaces + channels + roles.
A QuantMeet stage maps to a meeting/stage channel attached to the same Community.

## 17. Community lifecycle
CREATING → ACTIVE → RESTRICTED → ARCHIVED → DELETED.
Deletion is a controlled lifecycle; source resources are tombstoned/retained according to policy rather than immediately disappearing from every projection.

## 18. Discovery
Community discovery can use:
- explicit links
- username/handle
- invite code
- search
- recommendations
- shared contacts
- ecosystem references.

Discovery ranking must respect visibility, age/safety policy, blocks, moderation state and user preferences.

Private communities must never appear in public discovery merely because an internal search index contains them.

## 19. Onboarding flow
Invite/link → community preview → rules → optional verification → requested role → membership acceptance → welcome surface → first recommended channel.

Join decisions are server-authoritative.

## 20. Community roles
Example bundles:
- owner
- administrator
- moderator
- event_host
- channel_manager
- member
- guest
- bot.

Roles are scoped to a community or space. A role in one community cannot automatically grant another community permissions.

## 21. Permission calculation
Inputs:
- principal identity
- membership state
- assigned roles
- channel overrides
- community policy
- account safety restrictions
- temporary event permissions.

Output is a capability set with provenance.

Every privileged API must recalculate authorization server-side; the client-provided role is presentation only.

## 22. Moderation
Community moderation stack:
1. user block/mute/report
2. spam/rate controls
3. automated content safety
4. raid/brigading/abuse signals
5. moderator queue
6. appeals/audit.

Moderation actions:
- warn
- restrict
- slow mode
- quarantine
- remove content
- remove member
- ban
- lock channel
- freeze invites.

High-impact actions need reason codes, evidence references and audit records.

## 23. Community events
Events are QuantChat meeting/session resources linked to Calendar when scheduled.
Event ownership remains QuantChat for meeting session state; Calendar remains authoritative for the calendar event.

Flow:
community → create event → optional Calendar capability → invitation → QuantMeet room → recording → Drive artifact → recap in community.

## 24. Community Quanty
Quanty modes:
- community assistant
- moderator assistant
- event assistant
- discovery assistant.

Examples:
- summarize today's discussions
- find unanswered questions
- draft weekly digest
- prepare event agenda
- welcome new members
- translate a thread.

Quanty never silently bans, removes members, changes roles or publishes announcements.

---

# C05 — Channel / Forum / Topic

## 25. Product role
C05 is the high-signal asynchronous/broadcast surface inside a Community.
It supports Telegram-style channels, Discord-style text/forum channels and WhatsApp-style announcement areas.

## 26. Channel types
- text: normal conversation
- announcement: one-to-many publishing
- forum: topic-oriented discussions
- media: media-heavy feed
- voice: persistent voice
- stage: moderated speaking
- meeting: QuantMeet entry surface.

## 27. Channel route
/chat/community/{communityId}/channel/{channelId}
Deep link: quant://chat/channel/{channelId}

## 28. Channel header
Name, description/topic, members/subscribers, search, notification control, pinned content, call/Meet where applicable, more.

Announcement channels additionally expose subscriber count and publisher identity.

## 29. Forum model
ForumTopic:
- topicId
- channelId
- title
- author
- tags
- state open/resolved/locked
- createdAt
- latestReplyCursor
- replyCount
- moderation state.

Topics are not a second message system. The root post is a Message and replies are Messages under a Thread projection.

## 30. Feed and unread model
Canonical order is cursor based.
Optional ranking can reorder only within the user's authorized visible set.
Unread state tracks a monotonic cursor per membership/channel.

Never compute unread by scanning every message on every open.

## 31. Publishing
Publisher flow:
draft → validation → optional moderation → schedule or publish → durable acceptance → event publication → subscriber projection.

Scheduled posts are domain commands with a durable schedule, not client timers.

## 32. Rich publishing
Support:
- text
- image/video
- files
- polls
- links
- ecosystem resource cards
- stickers/reactions
- embeds
- event/meeting cards.

All external resource cards re-authorize when opened.

## 33. Threads
Thread side panel shows root context, participants, replies, unread cursor, moderation state and optional Quanty summary.
Thread closure/resolution is metadata; messages remain immutable communication facts.

## 34. Channel permissions
Capabilities:
- view
- subscribe
- post
- reply
- react
- attach
- mention
- pin
- delete
- moderate
- manage_channel
- manage_roles
- create_event
- start_stage
- start_meeting
- manage_bots.

Channel-level overrides may narrow community role permissions.

## 35. Scheduled messages
Server scheduler owns execution.
State: SCHEDULED → DUE → EXECUTING → PUBLISHED or FAILED.
Execution uses an idempotency key so scheduler retries cannot duplicate a post.

## 36. Live/stage channels
Stage channel:
- audience
- speakers
- moderators
- hand-raise queue
- captions
- reactions
- optional recording
- Quanty meeting assistant.

Speaker promotion/demotion is an authorization-controlled state transition.

Media uses WebRTC/SFU. Stage metadata remains QuantChat-owned.

## 37. Bot and mini-app integration
Channels expose scoped bot capabilities.
Bot installation requires explicit scopes.
Bot event subscriptions are filtered to the channel/community and authorized capabilities.
Mini apps receive a narrow signed context, not the user's complete account token.

## 38. C03/C04/C05 realtime architecture
Durable:
- membership changes
- message events
- role/permission changes
- channel configuration
- scheduled publication
- moderation actions.

Ephemeral:
- typing
- presence
- hand raise
- transient stage speaker state.

Durable events use the ecosystem event spine and are replayable.
Ephemeral events use the realtime gateway and expire automatically.

## 39. Cross-screen navigation
C03 → C04: group can be attached to a community.
C04 → C05: selecting a channel opens the channel surface.
C05 → C03: forum/channel thread can escalate into a focused group conversation where policy permits.
C03/C04/C05 → C07: voice call.
C03/C04/C05 → C08: QuantMeet/stage.
C03/C04/C05 → C10: Quanty.

## 40. Unified data ownership
Community domain owns community/channel/membership/role/permission/invitation/subscription state.
Message domain owns actual messages/replies/reactions.
Call/Meeting domain owns media session state.
Calendar owns scheduled calendar events.
Drive owns recordings/files.
Contacts owns canonical person identity.
Economy owns credits.
Quanty owns derived AI session/action state.

## 41. Failure modes
Community discovery unavailable → direct invite links still work.
Presence unavailable → community remains usable; presence becomes unknown.
Search unavailable → channels/messages remain usable.
Moderation worker delayed → content enters policy-defined pending/quarantine state.
Event bus delayed → authoritative transaction remains committed; projections catch up.
SFU unavailable → meeting joins may fail while text/community functionality remains available.
Calendar unavailable → event can remain a QuantChat meeting resource without pretending Calendar creation succeeded.

## 42. Security invariants
1. Private communities never leak through discovery.
2. Role claims from clients are never trusted.
3. Every channel operation is authorization checked.
4. Bot scopes cannot expand into user-wide permissions.
5. Invite links are revocable and policy-scoped.
6. Moderation actions are audited.
7. Resource cards re-check authorization on open.
8. Membership removals invalidate relevant sessions/subscriptions.
9. Scheduled messages execute under the original authorization policy and current safety policy.
10. Cross-app databases are never directly mutated.

## 43. Test matrix
Unit: permission calculation, membership transitions, channel state, scheduled-message state, topic state.
Property: unauthorized principal never gets a capability; duplicate scheduled execution never duplicates a post; removed member cannot regain access from cached role state.
Integration: invite → join → channel access; role change → realtime propagation; moderation → projection; scheduled post → event → subscribers; community → Meet → Drive recording.
Load: high-member community, high-volume channel, burst join/leave, mention fanout, live stage.
Browser/mobile: navigation, channel switching, thread, moderation, scheduled publish, offline/reconnect, accessibility.

## 44. Next deep slice
Next: C06 Camera + Stories + Spotlight + AR. It will define the camera pipeline, lens sandbox, 3D/AR rendering, capture state machine, media processing, story privacy/expiry, Spotlight ranking, safety, device capability fallback and cross-posting into Chat/Communities/QuanTube.