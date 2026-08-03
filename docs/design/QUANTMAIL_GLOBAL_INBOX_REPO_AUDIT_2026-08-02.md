# QuantMail Global, Inbox, and Repository Audit — 2026-08-02

> Scope: global error/loading states, active Inbox/reading pane, MailCopilot, and repository detail on `main` at `1404e9bcd1e301798d36ef9a3fd3ebf594193350`.

## Executive finding

The active Inbox has the strongest visual direction in QuantMail: mail-first hierarchy, responsive list/preview behaviour, accessible selection/star labels, reduced-motion-aware swipe, activation-oriented empty states, and canonical identity. The remaining gaps are operational rather than cosmetic: mutation safety, keyboard semantics, attachment trust, error containment, and query ownership.

## Global error boundary

### Current behaviour

- Shows `error.message` directly.
- Offers retry only.
- Animates entrance and action feedback.

### Required boundary

- Map known failures to product copy.
- Keep safe correlation detail secondary.
- Add a route-safe escape when retry repeats.
- Never expose stack, database, transport, or provider details as primary copy.
- Respect reduced motion for all nonessential animation.

## Global loading state

### Current behaviour

- One desktop sidebar/list skeleton represents every route.
- Fade and pulse animation are always present.

### Required boundary

- Use route-shaped loading states where task structure differs.
- Keep stable dimensions to avoid layout shift.
- Do not render a desktop shell skeleton for auth/mobile routes.
- Suppress nonessential motion when reduced motion is requested.
- Keep decorative skeletons quiet to assistive technology.

## Inbox

### Strengths

- Responsive mobile-to-desktop open behaviour.
- Canonical mobile identity and compose action.
- Search miss and empty inbox have useful recovery actions.
- Swipe archive is disabled under reduced motion.
- Selection and star controls have accessible names.
- Reading preview preserves list context on desktop.

### Operational gaps

- Batch archive/delete uses `Promise.all`, clears all IDs, and provides no partial-failure state.
- Destructive batch delete has no confirmation.
- Swipe archive has no undo.
- Star/archive errors are not surfaced.
- The clickable email `article` lacks native link/button keyboard semantics.
- Preview selection can become stale when category/search/result data changes.
- Attachments open raw URLs without a visible download/trust boundary.
- “Search people, subjects, or meaning” exceeds the verified email-search result model.

### Required boundary

- Preserve failed IDs and report partial success.
- Confirm irreversible batch actions.
- Add undo for reversible archive.
- Make rows keyboard-openable with visible focus.
- Reconcile preview selection after data-set transitions.
- Add attachment type/size/source/trust handling.
- Keep search copy aligned with actual retrieval behaviour.

## MailCopilot

### Strengths

- Quick actions are currently navigation-only and labelled Open.
- Footer distinguishes common navigation from workspace-aware suggestions.
- `Ctrl/Cmd + K` guidance matches the real global handler.

### Gap

`Review priority inbox` routes to the general inbox without a verified priority filter. Use `Open inbox` until a dedicated priority view exists.

## Repository detail

### Strengths

- Code, PR, Issues, Branches, and Commits are grouped coherently.
- File content has a focused retry state.
- Desktop file-tree/viewer structure is appropriate for a code workspace.

### Gaps

- Repository errors have no retry/back recovery inside the state.
- Most tab-query errors are not rendered.
- Every tab query starts regardless of active tab.
- Folders are disabled instead of navigable.
- PR/issue cards do not open details.
- Tabs lack complete tablist/tab/tabpanel semantics and keyboard behaviour.
- Empty states provide no verified initialization/import action.

### Required boundary

- Enable/query tab content intentionally.
- Isolate error/retry per tab.
- Implement navigable folders and breadcrumbs.
- Add detail navigation only where routes/contracts exist.
- Use complete accessible tab semantics.
- Preserve file-reading context across tab changes.

## Release rule

The flagship screen graduates only when visual hierarchy, keyboard operation, mutation recovery, partial failure, and trust boundaries work together. A polished card cannot compensate for an unsafe action or an inaccessible row.