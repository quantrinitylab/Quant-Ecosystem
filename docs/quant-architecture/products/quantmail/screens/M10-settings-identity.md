# M10 — Settings, Identity & Personalization

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Principle

Settings is a unified navigation surface, not a single domain.

## Sections

- Account & identity
- Mail behavior
- Send & compose
- Labels and organization
- Notifications
- Quanty & AI
- Privacy
- Security
- Connected apps
- Devices
- Appearance
- Accessibility
- Storage
- Billing/Credits entry

## Ownership

Identity/security owns account, sessions, MFA, passkeys and recovery.
Mail owns aliases, signatures, sending defaults, labels and mail rules.
Attention owns notification preferences.
Quanty owns AI preferences, agent permissions and memory controls.
Drive owns storage/quota details.
Credits/economy owns billing and credit policy.
Appearance is client/platform configuration.

The Settings UI must not duplicate domain policy.

## UX

Desktop:
- settings navigation
- section header
- form/detail pane
- save state
- audit-sensitive changes

Mobile:
- searchable settings
- grouped sections
- full-screen detail
- explicit confirmation for security-sensitive changes

Every setting shows current state and, where relevant, scope:
account / device / product / organization.

## Evidence

- load
- update
- validation error
- optimistic conflict
- permission denied
- security re-auth
- offline/reconnect
- cross-device propagation
