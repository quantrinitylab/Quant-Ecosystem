# M36 — QuantMail Workspace UI/UX Foundation

## Purpose

M36 establishes the product-facing UI/UX architecture for the five applications inside the QuantMail Workspace:

1. QuantMail — email
2. QuantCalendar — calendar
3. QuantDrive — files
4. QuantContacts — people
5. QuantGit — developer workspace

This milestone is intentionally separate from backend/domain milestones. It defines how the five products feel like one workspace without collapsing their ownership boundaries.

## Design thesis

QuantMail Workspace is one coherent workspace, not five unrelated dashboards. The shell provides identity, app switching, universal search, Quanty access, account/session controls, and responsive behavior. Each product owns its navigation, information hierarchy, workflows, and contextual actions.

Target qualities:
- Gmail-level information density without cloning Gmail
- Superhuman-level keyboard and interaction speed
- Notion-level contextual surfaces
- Linear-level precision and state clarity
- Quant-native AI assistance through Quanty

## Shell invariants

- Exactly one global workspace switcher per active surface.
- Exactly one product-context navigation system.
- Deep workflows may suppress global chrome when focus improves the task.
- Product navigation never impersonates another product's ownership.
- Quanty is accessible globally but its actions remain policy-bound.
- Responsive layouts reflow information; they do not merely shrink desktop UI.
- Touch targets remain accessible and safe-area aware.
- Loading, empty, error, offline, permission, and degraded states are first-class designs.

## Surface model

Desktop: global rail/top controls + product navigation + primary workspace + optional contextual rail.
Tablet: compressed shell + product navigation + adaptive contextual surfaces.
Mobile: compact app switcher/search/action header + product workspace + contextual bottom navigation where appropriate.

## Density modes

Compact, Comfortable, and Touch. Density changes spacing and row height but never removes required information or safety affordances.

## Visual language

Use Quant brand tokens and semantic states. Product identity may vary through accents and iconography, but typography, spacing, focus treatment, elevation, motion principles, and accessibility behavior remain shared.

## Motion

Motion communicates hierarchy, continuity, and state. Avoid decorative animation. Respect reduced-motion preferences. No animation may block keyboard or screen-reader interaction.

## Accessibility baseline

WCAG-oriented contrast, visible keyboard focus, semantic landmarks, logical tab order, accessible names for icon-only actions, reduced motion, scalable text, screen-reader announcements for async state changes, and touch targets suitable for mobile use.

## M36 completion criteria

- Five-app shell is specified.
- Shared component/state vocabulary is specified.
- Each app has explicit ownership of navigation and actions.
- Desktop/tablet/mobile behavior is defined.
- Deep-link and back-navigation behavior is defined.
- Quanty surfaces are contextual rather than intrusive.
- Screen specifications can be implemented without inventing major UX rules.
