# M36 — UI/UX Foundation Testing

## Structural tests

- One global app switcher per active surface.
- One contextual bottom navigation on mobile.
- No duplicate legacy navigation.
- QuantGit does not import consumer AppShell navigation.
- Deep workflows can suppress suite chrome and restore origin context.

## Responsive tests

Test desktop, tablet, mobile, narrow mobile, large text, reduced motion, keyboard-visible mobile, and landscape states.

## Interaction tests

Verify keyboard navigation, focus restoration, escape/close behavior, browser back behavior, app switching, search handoff, contextual rail collapse, drawer/sheet behavior, and destructive-action safeguards.

## Product tests

QuantMail: list/thread/compose continuity.
QuantCalendar: view switching/event edit continuity.
QuantDrive: upload/preview/progress continuity.
QuantContacts: profile/edit/unknown sender behavior.
QuantGit: repository/PR/check navigation.

## Degraded-state tests

A secondary dependency failure must not blank unrelated primary content. Quanty unavailable must not prevent normal product operation.

## Accessibility tests

Automated semantics plus manual keyboard/screen-reader checks are required before UI milestone acceptance.
