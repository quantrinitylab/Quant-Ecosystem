# M36 Screen Specification — QuantMail Workspace Shell

## Global desktop layout

1. Workspace identity/app switcher
2. Product navigation rail
3. Primary content canvas
4. Optional contextual rail
5. Global Quanty entry point
6. Account/session menu

The shell must not create duplicate navigation bars when a product already owns a specialized navigation surface.

## App switcher

The switcher exposes the five QuantMail Workspace apps: Mail, Calendar, Drive, Contacts, Git. It shows active state, keyboard navigation, tooltip labels, and recent/deep-link continuity. It must not expose deprecated product names.

## Universal search

Search opens from every product and preserves the originating product context. Results are grouped by Mail, People, Events, Files, and Git. The UI must distinguish authoritative results from Quanty suggestions.

## Quanty entry

Quanty opens as a contextual workspace surface. It receives the current route/object as context only when permitted. It must display when an action is advisory, requires approval, is executing, or has been verified.

## Contextual rail

Desktop-only by default. It can show related people, events, files, Git objects, security signals, or Quanty context. It must never become a second primary navigation system.

## Responsive rules

Desktop >= 1200px: full shell.
Tablet 768–1199px: compressed navigation and contextual rail becomes overlay/drawer.
Mobile < 768px: app switcher and product actions collapse into compact top controls; product-specific bottom navigation is allowed where useful.

## Deep workflow rule

Compose, focused editor, event editor, file preview, code review, and similar tasks may enter a focused mode. Focused mode keeps only actions necessary to safely finish the task and provides an obvious return path.

## Global states

Every shell surface supports loading, offline, reconnecting, permission denied, session expired, degraded dependency, empty search, and unexpected error states.
