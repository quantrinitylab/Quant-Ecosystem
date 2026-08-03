# QuantMail Code and Account Surface Audit — 2026-08-02

> Scope: repository list/create, pipeline overview/actions, appearance settings, and Security status surfaces on `main` at `1404e9bcd1e301798d36ef9a3fd3ebf594193350`.

## Executive finding

These screens have useful structure and increasingly honest empty states, but four boundaries still allow presentation to move ahead of verified product contracts:

1. repository validation exists server-side but is not surfaced or typed clearly in the UI;
2. pipeline presentation exceeds the currently modelled CI execution and deployment contract;
3. shared theme infrastructure exists, but Settings and AppShell fragment ownership while density remains inert;
4. Security renders definitive empty inventories and 2FA stages without verified backend inventory/enrollment contracts.

The fixes are tracked in issues #113–#116.

## Repository creation

### Strengths

- Search distinguishes an empty workspace from no matching repositories.
- Private is the initial UI and server default.
- The create modal exposes name, description, and visibility.
- The active `/repos` adapter accepts lowercase visibility, normalizes persistence to uppercase, and returns lowercase DTO values.
- The backend validates repository names and rejects owner-scoped duplicate active names.

### Gaps

- The UI/hook uses `visibility: string` instead of the verified visibility union.
- Empty names fail silently in the modal.
- Backend name constraints are not explained or mirrored inline.
- Duplicate-name, pending, and mutation-error states are not rendered clearly.

### Required boundary

Use the verified visibility union across UI/client boundaries, surface backend validation and duplicate errors inline, preserve modal input on failure, and prevent repeat submission. Do not add redundant casing conversion: the active backend adapter already owns normalization.

Tracking: #113.

## Pipelines

### Strengths

- Build history is DB-backed and owner-scoped through repository ownership.
- Status variants distinguish success, failure, running, pending, and cancelled.
- Workflow, build, and deployment sections load independently.

### Verified capability limits

- Workflow definitions are not modelled; `/ci/workflows` returns an empty list.
- Deployment records are not modelled; `/ci/deployments` returns an empty list.
- Trigger interprets the supplied ID as a repository ID and creates a pending `CiRun` with placeholder commit SHA `HEAD`.
- Cancel updates the `CiRun` row to `CANCELLED`; it does not prove an execution worker/job was stopped.
- Trigger/Cancel actions lack bounded pending/error/recovery states in the page.

### Required boundary

Either present the screen as build-record history and disable unsupported workflow/deployment controls, or implement real workflow definitions, commit resolution, idempotent execution jobs, worker cancellation, logs, artifacts, and deployment persistence. UI status must describe verified execution—not only row state.

Tracking: #114.

## Appearance settings

### Strengths

- The shared `ThemeProvider` already owns `light | dark | system`, persists `quant-theme`, listens to OS preference changes, and updates root theme state.
- The root layout bootstraps stored theme before hydration.
- Settings theme and density choices are explicit and expose pressed state.

### Gaps

- Settings maintains duplicate local theme state and writes storage directly instead of using `useThemeMode()`.
- Settings toggles only the root dark class while the provider also owns `data-theme` and resolved state.
- Settings and other active pages pass `theme="dark"` to `AppShell`, overriding application-level intent.
- `quant-density` appears only in Settings storage reads/writes; no provider, root attribute, or token consumer was found.

### Required boundary

Make the shared ThemeProvider the only theme owner, have AppShell consume the resolved mode, and remove duplicate Settings logic. Define density through documented root/token ownership or disable Compact until it has a measurable product effect. Preserve flash-free hydration and reduced-motion behaviour.

Tracking: #115.

## Security

### Strengths

- Password mutation has basic mismatch/length validation and success/error states.
- The page provides staged presentation for 2FA setup and verification.
- High-level sections for sessions and connected applications exist.

### Critical gaps

- “Only this device is active” is rendered without session inventory data.
- “No third-party apps connected” is rendered without OAuth grant inventory data.
- No matching active session inventory route was found.
- No active TOTP setup/verify/enable/disable backend implementation was found.
- Backup codes appear in frontend state/contracts without verified hashing, one-time consumption, regeneration, or recovery routes.
- No verified 2FA login challenge is established.

### Required boundary

Unknown security state must render as unknown/unavailable, never safe/empty. Disable 2FA claims until enrollment and login challenge work end to end. Add authenticated session/OAuth inventories, re-authenticated destructive actions, hashed one-time backup codes, and session rotation/revocation integration.

Tracking: #116.

## Release rule

A status screen is evidence, not decoration. Missing inventory, worker, storage, or security data must render as unavailable/unknown; it must never be translated into “none,” “operational,” “cancelled,” “verified,” or another definitive claim without supporting contract evidence.