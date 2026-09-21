# Quant Ecosystem — where it actually stands

Every number here was measured from the repo or probed over HTTPS on 2026-09-20. Nothing is
estimated. Where something is missing I say so plainly, because a plan built on an optimistic
status report is worse than no plan.

## 1. The "next NVIDIA" question, answered honestly

NVIDIA is not dominant because it ships many products. It is dominant because **CUDA** made its
hardware the substrate everyone else builds on, and that platform layer compounds while individual
products come and go.

Translated to this repo: **the moat is not any one app. It is `packages/*`.** You have 106 shared
packages behind 11 apps — one identity root (QuantMail issues the tokens every app accepts), one
credits ledger, one AI engine, one Prisma schema of 175 models. A competitor can clone QuantGram's
UI in a quarter. Cloning _"one account, one wallet, one AI memory, eleven surfaces"_ means rebuilding
the platform layer first.

That is the real asset, and it is genuinely unusual. Two caveats worth stating:

- **The analogy has a hard limit.** NVIDIA sells compute infrastructure; this is a consumer
  application suite riding on someone else's compute (AWS, plus OpenAI/Anthropic for inference).
  You are positioned to be the _integration_ layer, not the silicon. If "next NVIDIA" means owning
  the substrate, the nearest honest comparison is early Google or Meta's app family — a platform
  that owns identity and distribution. That is still a very large prize.
- **Right now the moat is under-exploited.** 39 of 106 packages have **zero consumers**
  (~59,000 LOC), and `@quant/security` (12,753 LOC) is declared by a service but never imported.
  The platform layer is wide, but a third of it is shelfware. Consolidating that is higher leverage
  than starting app #12.

## 2. What exists, measured

| App          | Package                                  |         LOC | Routes | Services | Tests | Live                          |
| ------------ | ---------------------------------------- | ----------: | -----: | -------: | ----: | ----------------------------- |
| QuantMail    | `@quant/quantmail`                       | **189,703** |     36 |       71 |   190 | ✅ `quantmail.in`             |
| QuantChat    | `@quant/quantchat`                       |      69,373 |     27 |       42 |    97 | ✅ `quantchat.quantrinity.in` |
| QuantAI      | `@quant/quantai`                         |      37,371 | **43** |       22 |    42 | ✅ `quantai.quantrinity.in`   |
| QuantUbe     | `@quant/quantube`                        |      31,468 |     16 |        9 |    29 | ⚠️ 503                        |
| QuantWave    | `@quant/quantwave` _(dir `quantsync`)_   |      25,508 |     13 |       20 |    20 | ⚠️ 503                        |
| QuantGram    | `@quant/quantgram` _(dir `quantneon`)_   |      23,269 |     14 |       12 |    19 | ⚠️ 503                        |
| QuantMax     | `@quant/quantmax`                        |      22,986 |     15 |       12 |    18 | ⚠️ 503                        |
| QuantAds     | `@quant/quantads`                        |      19,960 |     15 |       17 |    19 | ✅ `quantads.quantrinity.in`  |
| QuantCooks   | `@quant/quantcooks` _(dir `quantedits`)_ |      19,611 |      9 |       11 |    14 | ❌ 404                        |
| QuantTrinity | `@quant/quanttrinity`                    |       4,944 |  **0** |    **0** |     4 | ⚠️ 503                        |
| Mobile shell | `@quant/quant-mobile`                    |       4,085 |      0 |        0 |     9 | n/a                           |

> Three directory names do not match their package names (`quantsync`→quantwave,
> `quantneon`→quantgram, `quantedits`→quantcooks). `turbo --filter` takes the **package** name.
> This has already cost real debugging time; renaming the directories is a cheap permanent fix.

**Reading the table:** QuantMail is 2.7× the next app and holds 39% of all app code. QuantAI has the
most routes of any app despite being a third of QuantMail's size — it is API-dense, not UI-dense.
QuantTrinity has **zero** backend routes or services: it is a shell, not an app.

## 3. Who each app competes with, and the honest gap

| App              | Competes with                                | Where it genuinely stands                                                                                                                                                               |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QuantMail**    | Gmail, Outlook, Proton, Superhuman           | The only app at credible depth: 36 routes, 71 services, real SES delivery, suppression/bounce handling, 2FA, OAuth, PGP, CalDAV, collaborative docs. This is a product.                 |
| **QuantChat**    | WhatsApp, Telegram, Signal; Snapchat (snaps) | Strong: E2EE, transactional outbox, streaks, view-once. Realtime backplane exists here and **only** here.                                                                               |
| **QuantAI**      | ChatGPT, Claude, Gemini, Perplexity          | API surface is broad (43 routes) and model-agnostic. The differentiator is cross-app memory — no competitor can see your mail _and_ chats. That is the sharpest wedge in the portfolio. |
| **QuantUbe**     | YouTube                                      | Has payouts, subscriptions, music, cross-publish. Not live.                                                                                                                             |
| **QuantWave**    | X/Twitter, Threads, Bluesky; Twitter Spaces  | Was the weakest: its frontend was largely unbacked. Audio Spaces, search, and the auth lifecycle were built this session. Not live.                                                     |
| **QuantGram**    | Instagram                                    | Stories, reels, AR filters, DMs, close friends all real and Prisma-backed. The feed had **no content source** until this session. Six pages still mocked.                               |
| **QuantMax**     | TikTok + Tinder/Bumble/Hinge                 | Unusual hybrid (short video + dating + live). Thinnest service layer relative to ambition (12 services).                                                                                |
| **QuantAds**     | Google Ads, Meta Ads Manager                 | Live. This is the **monetisation engine for the whole portfolio** — every other app is inventory. Under-weighted at 19,960 LOC.                                                         |
| **QuantCooks**   | CapCut, Canva, Adobe Express                 | Smallest real app; returns 404.                                                                                                                                                         |
| **QuantTrinity** | — (unified launcher)                         | Shell only. Strategically this should be the front door to everything; today it is 4,944 LOC with no backend.                                                                           |

**The strategic read:** you are not competing with eleven companies. You are competing on _one
account across eleven surfaces_, and the two apps that make that real are **QuantAI** (cross-app
memory) and **QuantTrinity** (the front door). QuantAI is well developed; QuantTrinity is empty.
That is the single biggest strategic mismatch in the repo.

## 4. Platform coverage — the honest gaps

| Platform    | Status                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web**     | ✅ 11 Next.js apps. This is the whole product today.                                                                                                                                                                                                 |
| **Android** | ⚠️ Partial. A Capacitor shell (`apps/quant-mobile`, appId `com.quant.app`, 4,085 LOC) plus a native Gradle project (`android-project`, same namespace) and two prebuilt APKs in `apk testing/`. It wraps the web app; it is not a native experience. |
| **iOS**     | ❌ **Does not exist.** No `ios/` directory, no `Podfile`, no `.xcodeproj` anywhere in the repo. Capacitor _can_ generate it (`npx cap add ios`) but nothing has been.                                                                                |
| **Desktop** | ❌ **Does not exist.** Zero references to Electron or Tauri in any `package.json`.                                                                                                                                                                   |

So "app, website, desktop, Android, iOS — sab taiyaar karna hai" is currently **web + a partial
Android wrapper**. Two of the four platforms have not been started.

The good news: Capacitor already being in place means iOS is a genuinely small step —
`npx cap add ios` plus signing and store metadata, not a rewrite. Desktop via Tauri wrapping the
same web build is comparably cheap. **Neither requires new product code.** Both require Apple
Developer / signing infrastructure, which is an account and process problem, not an engineering one.

## 5. What I fixed this session (verified)

Repo-wide: `typecheck 190/190` · `lint 123/123` · `test 190/190` — all three previously had failures.

- **CI was red on `main` for every PR.** Three unconditional gates failed (adm-zip HIGH advisory
  where the override pinned to a still-vulnerable version; ADR-012 unindexed). Landed via #262 in
  parallel with my #264.
- **QuantChat snaps were dead end to end, and still are on `main`.** #262 removed the dead type
  comparisons — silencing the typecheck error — but nothing writes `metadata.viewOnce` and the route
  still strips `disappearMode`, so `consumeSnap` returns 400 for every real snap. Fixed properly in
  #267 with 7 tests asserting what is _persisted_.
- **QuantWave proxied to itself.** All 40 route handlers defaulted to port 3003 — Next's own port —
  instead of the backend on 3004.
- **QuantWave's Tailwind never compiled.** No `tailwind.config`/`postcss.config` existed, so
  `@tailwind` directives passed through unprocessed and _zero_ utility classes were generated.
- **QuantWave had 21 dangling API paths.** Built Spaces (with migration 0069), search/explore/
  trending, auth session lifecycle, notification preferences, quote posts, feed engagement. Added a
  contract test so a dangling path now fails CI.
- **QuantGram's feed had no content source** — it ranked an in-memory map nothing ever filled, so a
  fresh backend served an empty feed and every restart lost it.
- **QuantMail's test suite opened real database connections** through a DI leak.

## 6. What to do next, in order

**Now — finish what is already built (days, no new product work).**

1. Get the five 503 hosts live: quantwave, quantgram, quantube, quantmax, quanttrinity. They have
   manifests and ECR references from #266; they need an image at the deployed SHA and a rollout.
   See `DEPLOY-QUANTGRAM-QUANTWAVE.md`.
2. Apply migration `0069` in staging before QuantWave goes up.
3. Fix `quantedits`/`admin` 404s — no ingress rule matches those hosts.
4. Rename the three mismatched directories.

**Next — platform reach (weeks).**

5. `npx cap add ios` against the existing Capacitor shell, then Apple Developer enrolment and
   signing. Highest reach-per-effort item in the repo.
6. Tauri desktop wrapper over the same web build.
7. Decide what QuantTrinity _is_. If it is the front door, it needs to be the most-invested app,
   not the emptiest.

**Then — consolidate the moat (the compounding work).**

8. Reduce the 39 unconsumed packages. Either wire them or delete them; ~59,000 LOC of shelfware is
   a tax on every build and every new engineer.
9. Resolve the duplicate pairs: `payment` (665 LOC, QuantAI only) vs `payments` (14,782 LOC, three
   apps); `recommendation` (236) vs `recommendations` (8,767). QuantAI is wired to the toy version
   of both — for payments that is a correctness and compliance risk.
10. Lift the realtime backplane out of QuantChat into `@quant/realtime` so Spaces, live video and
    presence work everywhere. Right now QuantChat is the only app with a WebSocket server.
11. Make `full-sweep` blocking in CI with an explicit allowlist, so repo-wide breakage cannot be
    invisible again.

**One thing worth resisting:** do not start app #12. The portfolio's problem is not breadth — it is
that five built apps are not serving traffic and a third of the platform layer is unused. Depth on
QuantAI and QuantTrinity, plus iOS, will move the business more than any new surface.
