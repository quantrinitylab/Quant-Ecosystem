# QuantChat — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B2).

**Authoritative spec note:** the social paradigm below is already defined in
`products/quantchat/01-unified-social-messaging-meeting-architecture.md`
("Snapchat-class camera/social" pillar) and deep-dived in
`05-screen-deep-dive-c06-camera-stories-spotlight-ar.md`. This file only closes
the inventory gap — it does not re-spec what those docs cover.

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/stories` | Stories feed + viewer + creator | `useStories` → backend; text stories persist end-to-end; photo/video post for http(s) URLs, honest "coming soon" where media upload has no backend | loading, error+retry, empty+create CTA |
| `/spotlight` | Curated short-video feed | Backend-computed engagement ranking (likes/comments/shares/watch-through), 15-min refresh; `@quant/recommendation` personalization when available | loading, ranked feed, "For you" indicator |
| `/memories` | Saved-media vault | `useMemories` → backend; date/location/caption search; soft-delete with 5s undo window | grid, viewer (re-share/send/download), undo countdown |
| `/reels` | Reels feed + uploader | `/api/reels` backend; upload pipeline with overlay/effects | feed, uploading, error |
| `/map` | Friend/location map | `/api/map/friends` — starts empty, filled only with real shares; geolocation-denied fallback | empty (honest), populated, denied-fallback |
| `/camera` | Camera-first capture | Camera → GPU effects → AR/lens runtime → safety checks → story/chat/spotlight/share | capture, effects, review, share |
| `/new-chat` | Start conversation | `apiClient` contact search → conversation create | search, results, creating |
| `/profile` | Profile hub | Backend profile; links stories/spotlight/memories + settings | loaded, editing |
| `/privacy`, `/support`, `/terms` | Policy/support pages | Static | Static |
| `/login` | SSO login entry | QuantMail SSO (ecosystem identity root) | form, redirecting |

## Navigation paradigm

Bottom nav (`src/lib/navigation.tsx`): Chats, Stories, Camera, Spotlight, Map —
the 5-tab social paradigm. Stories/Spotlight/Memories also reachable from the
Profile hub. This is the shipped, spec-backed paradigm; `12-screen-inventory.md`
C01–C13 (messaging-only) is the stale artifact.

## Backend extras (kept, group verdict)

`ar-lenses, games, map, spotlight, themes, avatar, polls, reels,
e2ee-prekeys/encryption/prekeys, ephemeral, voice-bot, voice-notes, memories,
ai-agent/ai, federation, settings, search, users, notifications` — all present
under `apps/quantchat/backend/routes/`, spot-checked real with zero mock
markers. Endpoint-level contracts are a follow-up via `18-backend-spec-template.md`.
