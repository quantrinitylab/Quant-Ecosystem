# App Map and De-duplication Decisions

**Status:** Authoritative. Owner-approved on 2026-09-11.
**Recorded against:** `main` = `26a8173409ad768b8d096b68f9a3a6ea031ea00e`
**Supersedes:** the "rest of the apps are strategically frozen" framing in
`.agents/project-memory/OWNER_INTENT_AND_VISION.md`, and PR #246 (which only marked two apps
`"deprecated": true` and deleted nothing).

## Why this file exists

`apps/` currently contains 18 directories. Several of them are duplicate prototypes of features that
belong inside QuantMail, and agents have repeatedly regenerated them. This file is the single
authoritative app map.

**Do not create a new top-level `apps/` directory that is not listed under "Approved apps" below.**
**Do not re-create any directory listed under "Retired".**

## Governing rule

> Nothing gets deleted until its consumers are rewired.
> The order is always: **migrate -> flip the registry -> delete -> verify green CI.**

Deleting before the registry is flipped breaks the build. Deleting before the migration is finished
loses features. Both steps have to happen, in that order.

## Approved apps

| App            | Role                                | Notes                                                                                                                                                          |
| -------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quantmail`    | Flagship unified workspace          | Mail + Calendar + Drive + Contacts + Documents + CodeHub. Hosts the unified cross-app memory inside Drive.                                                      |
| `quantchat`    | Messaging, meetings, call-alarm     | Absorbs QuantMeet. Quanty creates the meeting link and mails attendees. Also rings like an alarm until the user answers, then talks them through the task.       |
| `quantai`      | Quanty control plane                | Drives every other app on the user's behalf.                                                                                                                    |
| `quantwave`    | Twitter/X + Reddit competitor       | **Renamed from `quantsync`.** The existing package description already matches this brief.                                                                      |
| `quantgram`    | Instagram competitor                | **Renamed from `quantneon`.** Quanty opens it, scrolls reels alongside the user, and comments on request.                                                        |
| `quantcooks`   | AI creative studio                  | **Renamed from `quantedits`.** Target is to beat Higgsfield.                                                                                                    |
| `quantube`     | YouTube competitor                  | Short-drama episodes, premium content, and a creator programme in the Bilibili mould.                                                                            |
| `quantads`     | Ads platform                        | The Meta Ads / Google Ads equivalent across every Quant app. Quanty can place campaigns from user intent.                                                        |
| `quanttrinity` | Company site and app marketplace    | Company story, download links, and a Play-Store-style marketplace for third-party QuantDeveloper games and apps. Also owns the cross-app native launcher shell.  |
| `quantmax`     | Short video, dating, games          | TikTok-style feed, Tinder-style matching, WePlay-style games, real-world games, and Omegle-style random chat. Later phase, but kept.                             |

## Retired

| Directory           | Decision                  | Where its functionality goes                                                                                            |
| ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/quantdrive`   | Delete after migration    | `apps/quantmail` Drive                                                                                                  |
| `apps/quantcalendar`| Delete after migration    | `apps/quantmail` Calendar; the alarm service feeds the QuantChat call-alarm                                              |
| `apps/quantdocs`    | Delete after migration    | Documents live inside Drive inside QuantMail                                                                            |
| `apps/quantmeet`    | Delete after migration    | `apps/quantchat`                                                                                                        |
| `apps/admin`        | Delete                    | Replaced by a per-app admin panel inside each app's own folder                                                          |
| `apps/status`       | Delete                    | Not a product                                                                                                           |
| `apps/marketing`    | Delete                    | Shell only (`src/index.ts` is 1,890 B plus near-empty directories). Marketing content belongs on `quanttrinity`.        |
| `apps/quant-mobile` | Re-home, do not delete    | Becomes `apps/quanttrinity/native/`. It is the Capacitor launcher shell, not a duplicate product.                       |

## Structural rules

1. **Admin panels are per-app.** Each app owns its own admin surface inside its own folder so that
   departments stay separate. There is no single global admin app.
2. **Native clients are per-app.** iOS, Android, and desktop builds for an app live inside that
   app's folder (for example `apps/quantmail/native/`), never as a sibling top-level app. The only
   exception is the cross-app launcher, which belongs to `quanttrinity`.
3. **Documents belong to Drive.** There is no standalone documents app.
4. **Unified memory lives in QuantMail Drive**, so Quanty has exactly one place to remember
   everything across apps.

## Deletion blockers, all verified on `main`

Every one of these must be handled before any directory is removed.

1. `packages/common/src/types.ts` - the `QuantApp` union lists 13 app ids and is consumed by
   `Notification.sourceApp`, `UserPresence.activeApp`, `AppGrant.appId`, `MemoryItem.appSource`, and
   `WebhookPayload.source`. **These are persisted values, so the three renames need a data
   migration, not just a type edit.**
2. `packages/common/src/constants.ts` - `QUANT_APPS` is a `Record<QuantApp, ...>` and must change in
   lockstep with the union.
3. `apps/quantmail/backend/routes/calendar.ts` - an in-file comment records that
   `apps/quantcalendar/backend/services/event.service.ts` writes the same `calendar_events` table
   and defines the shape. Two writers, one table.
4. `apps/quantmail/src/app/api/calendar/events/route.ts` and `.../events/[id]/route.ts` - these
   proxy to `QUANTCALENDAR_BACKEND_URL`, and the old default pointed at an undeployed service, so
   every request through them answered `502 BACKEND_UNAVAILABLE`.
5. `apps/quantmail/backend/routes/drive.ts` - the app-label map still names `quantdocs`,
   `quantmeet`, `quantcalendar`, and `quantdrive`.
6. `infra/prometheus/alerts/service-slos.yml` - `QuantMeetAvailabilitySLO` targets
   `service="quantmeet"`.
7. Each retiring app has its own `Dockerfile` and a fixed port: `quantmeet` 3109, `quantdocs` 3110,
   `quantdrive` 3111, `quantcalendar` 3112.
8. `pnpm-workspace.yaml` uses the `apps/*` glob and the root `turbo.json` has no per-app list, so
   deleting a folder de-registers it automatically. Only `pnpm-lock.yaml` needs regenerating.

Keep `apps/quantmail/src/components/QuantCalendarLogo.tsx`. QuantCalendar branding already lives
inside QuantMail and stays there.

## Feature gaps found while planning the migration

These gaps are the reason this is a migration and not a deletion.

**Drive.** QuantMail Drive today is `drive-storage.service.ts` (8,588 B) plus `folder.service.ts`
(4,471 B). `apps/quantdrive` has 12 services totalling 59,005 B. Six of them, **24,213 B in total,
have no QuantMail equivalent**: `ai-organize`, `ai-extract-data`, `ai-search-content`,
`ai-summarize-file`, `ai-duplicate`, and `storage-quota`. None of QuantMail's 19 `ai-*` services
cover these, and because there is no quota service, **uploads are currently unbounded**.

**Calendar.** `apps/quantmail/backend/services/` on `main` contains **no calendar, alarm,
booking-link, recurrence, or availability service at all** - only `routes/calendar.ts` (19,599 B).
All 12 of those services exist only in `apps/quantcalendar` (57,254 B), including
`recurring.service.ts` (11,615 B) and `alarm.service.ts` (3,681 B). The alarm service is precisely
the code the QuantChat call-alarm feature needs. Deleting `apps/quantcalendar` before porting it
would destroy the only implementation.

**Documents.** 20 services, 73,250 B, including a Yjs collaboration server, whiteboard, version
history, suggestions, and paragraph-level permissions. QuantMail Drive has no equivalent of any of
it.

**Meetings.** 11 services, 74,346 B, including SFU, recording, transcript, summary, action items,
and the LiveKit gateway and webhook. QuantChat has no equivalent of any of it.

**Total at risk:** 263,855 B of backend service code sits in the four apps marked for removal.

**The renames are cheap.** `apps/quantsync` already has 14 services and a package description
reading "QuantSync - Twitter/X + Threads + Reddit hybrid with anonymous feeds and live spaces", so
the code already matches the QuantWave brief; this is a rename plus the persisted-value migration.
`apps/quantmax` already has `random-chat.service.ts` (2,853 B), which is the Omegle seam, and
`safety.service.ts` (6,845 B). What is missing there is the games layer and real-world play.

## Execution waves

| Wave | Scope                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W-A  | Drive consolidation - port the six missing services into QuantMail Drive                                                                                                       |
| W-B  | Calendar consolidation - port 12 services, resolve the two-writer conflict, add `/booking` to the public paths                                                                  |
| W-C  | Documents into Drive - the collaboration stack moves under QuantMail                                                                                                           |
| W-D  | Meetings and call-alarm into QuantChat                                                                                                                                         |
| W-E  | `QuantApp` registry union, the three renames, and the persisted-value data migration                                                                                            |
| W-F  | Deletions and green CI - **only after A through E**                                                                                                                             |
| W-G  | Per-app admin panels on a shared `@quant/admin-kit`                                                                                                                             |
| W-H  | Per-app native clients                                                                                                                                                         |
| W-I  | New product scope: Quanty control plane, unified memory, quantgram, quantube, quantads, the quanttrinity marketplace, quantmax Omegle and games, quantwave spaces                |

## Conflict still to resolve

`docs/EXECUTION_QUEUE.md` currently allows only `M11D-SHADOW-CANARY` to be active. This programme
conflicts with that queue and needs an explicit owner-approved queue edit before W-A lands.
