# Security Triage — `Math.random()` Audit (M0)

_Captured 2026-06-20 by the acting CTO agent. Evidence-based; verified against source._

## Method

Enumerated every non-test `Math.random()` call in `apps/`, `packages/`, `services/`
(~469 sites total) and grepped the security-sensitive subset (token / OTP / secret / key /
nonce / id / auth / matchmaking / auction). Classified each as **CRITICAL** (bearer
credential or auth/access primitive), **MEDIUM** (guessable identifier, low blast radius),
or **BENIGN** (UI animation, simulated demo data, ephemeral client-only id).

## Findings

### CRITICAL — fixed this pass

| File                                                      | Issue                                                                                                                                                                             | Fix                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/quantai/src/services/conversation-share.service.ts` | Share **token** (a bearer credential granting access to a shared conversation) was built char-by-char from `Math.random()` → predictable/guessable, enabling unauthorized access. | Now uses `crypto.randomInt` (CSPRNG). Same 32-char length/alphabet, so behavior is unchanged. Added a regression test asserting 5,000 generated tokens are all unique and match `^[A-Za-z0-9]{32}$`. |

### Auth path — verified already clean (no change needed)

- `packages/auth/src/**`: **0** `Math.random()` occurrences. PKCE uses `node:crypto`
  (`randomBytes`, `subtle`); secure-random utils (`generateSecureToken`/`generateSecureCode`/
  `generateId`) are crypto-backed.
- `packages/moderation/src/services/phone-verification.ts` `generateCode()` (the actual phone
  **OTP**) already uses `crypto.randomInt`. The only `Math.random()` there is a _fake provider
  message id_ (Twilio/MSG91 stub response) — benign.

### MEDIUM — known debt (tracked, not blocking)

- `packages/cross-app-gaming/.../game-session.service.ts` & `services/matchmaking/.../matchmaker.ts`:
  game-session / pair ids from `Math.random().toString(36)`. Low blast radius (not secrets), but
  should migrate to `crypto.randomUUID()`. Left for the gaming/matchmaking hardening pass to avoid
  churning id formats that other code/tests may assert on.
- `apps/quantube/src/hooks/useLiveStream.ts`: builds a `sk_live_...` **stream key** client-side
  with `Math.random()`. This is **mock/demo data in a frontend hook**, not a server-issued secret.
  The real fix is server-side stream-key issuance (CSPRNG + storage), which belongs to the QuantTube
  live-streaming backend slice — tracked there, not patched as a fake.

### BENIGN (no action)

UI/animation jitter (`device.tsx` voice bars), simulated metrics (`code-interpreter` memoryUsed,
`agent-training` accuracy, `disaster-recovery` sizeBytes/fake checksum), demo feed/chat data
(`LiveStreamChat`, `speed-dating`, `RandomMatcher`), and ephemeral client-only list ids
(`UploadArea`, `capture-bar`, `xr-session`). These do not affect security and were intentionally
left as-is; several are flagged elsewhere as `@simulated` mock-debt to be replaced when their
backends are wired.

## Outcome

- 1 real vulnerability closed (predictable share token).
- Auth + OTP paths confirmed CSPRNG-backed.
- No toy crypto found on the authentication path.
- Remaining `Math.random()` is benign or tracked medium-debt tied to specific backend slices.
