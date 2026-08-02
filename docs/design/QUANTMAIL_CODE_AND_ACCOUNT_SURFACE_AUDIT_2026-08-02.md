# QuantMail Code and Account Surface Audit — 2026-08-02

> Scope: repository list/create, pipeline overview/actions, appearance settings, and Security status surfaces on `main` at `1404e9bcd1e301798d36ef9a3fd3ebf594193350`.

## Executive finding

These screens have useful structure and increasingly honest empty states, but four boundaries still allow presentation to move ahead of verified product contracts:

1. repository visibility and validation are not shared end to end;
2. pipeline actions lack bounded pending/error/recovery states;
3. theme and density controls may persist values without changing the actual shell;
4. Security renders definitive empty inventories without loading authenticated inventory data.

The fixes are tracked in issues #113–#116.

## Repository creation

### Strengths

- Search distinguishes an empty workspace from no matching repositories.
- Private is the initial UI default.
- The create modal exposes name, description, and visibility.

### Gaps

- UI submits lowercase visibility strings through a `string`-typed hook.
- The inspected backend code route defines uppercase visibility values.
- Empty names fail silently.
- Duplicate-name, pending, and mutation-error states are not rendered.

### Required boundary

Adopt one shared typed visibility contract, validate names consistently, preserve modal input on failure, prevent double submission, and prove owner/visibility authorization.

Tracking: #113.

## Pipelines

### Strengths

- Workflows, builds, and deployments load independently.
- Status variants distinguish success, failure, running, pending, and cancelled.
- Empty states point to repositories or the first workflow.

### Gaps

- Trigger and Cancel can be activated repeatedly while pending.
- Action failures have no local recovery UI.
- Deployment errors expose no retry action.
- Run logs/artifacts are not connected from the overview.
- Cancellation scope and downstream impact are not explained.

### Required boundary

Keep each section independently recoverable; add action-level pending/error/success, duplicate-trigger prevention, cancellation confirmation where impact exists, and links only to verified run details.

Tracking: #114.

## Appearance settings

### Strengths

- Theme and density choices are explicit.
- Preferences are stored locally.
- Buttons expose pressed state.

### Gaps

- The Settings shell is hard-coded to dark.
- Other active pages also pass a fixed dark theme.
- Density is stored but no inspected screen consumes it.
- System mode is evaluated only when changed, not kept reactive to OS changes.

### Required boundary

Either centralize and apply semantic theme/density through the application provider, or disable the controls and state that the product is currently fixed to dark/comfortable. Do not persist inert preferences.

Tracking: #115.

## Security

### Strengths

- Password mutation has basic mismatch/length validation and success/error states.
- 2FA has setup, verification, and completion stages.
- High-level sections for sessions and connected applications exist.

### Critical gaps

- “Only this device is active” is rendered without session inventory data.
- “No third-party apps connected” is rendered without OAuth grant inventory data.
- No matching session inventory route was found in active backend route search.
- Backup codes are placed in client state and displayed before enable verification completes.
- No verified disable, regenerate, recovery, individual-session revoke, or OAuth-grant revoke flow is present.

### Required boundary

Unknown security state must render as unknown/unavailable, never as safe/empty. Add authenticated inventories, re-authenticated destructive actions, and a one-time verified backup-code boundary before making definitive claims.

Tracking: #116.

## Release rule

A status screen is evidence, not decoration. When an inventory cannot be loaded, the interface must state that it is unavailable; it must never infer “none” from missing data.