# QuantMail UI Audit — 2026-07-30

> Scope: owner-supplied desktop screenshots plus source inspection on `main` at `45a1381d65aef505881217e3e0ed7187b4e04b3f`.

## Executive finding

QuantMail contains meaningful functionality and some accessibility-aware engineering, but the delivered experience lacks one enforced visual system. Authentication has a recognisable purple identity; post-login views combine navy navigation, white canvases, black cards, blue controls and a separate tricolour parent mark. Feature breadth is exposed through navigation faster than each feature is activated through a complete workflow.

This cannot be fixed by a colour swap. The root problems are competing visual ownership, an oversized global stylesheet, repeated generic states and AI split between disconnected surfaces.

## Evidence reviewed

Screens:

- register, login and registration-success state;
- inbox, reading pane, compose and search;
- sent, drafts and trash;
- calendar, contacts and add-contact dialog;
- drive failure;
- repositories and pipelines;
- settings and security surfaces.

Source:

- `apps/quantmail/src/app/page.tsx`;
- `apps/quantmail/src/components/AppShell.tsx`;
- `apps/quantmail/src/components/AppSidebar.tsx`;
- `apps/quantmail/src/components/AIAssistant.tsx`;
- `apps/quantmail/src/app/globals.css`;
- brand/shared-UI token files and current Quantrinity SVG.

## Strengths to preserve

- `AppShell` traps mobile-drawer focus, restores focus, supports Escape and reduced motion.
- Sidebar uses semantic groups and `aria-current`.
- Inbox rows expose checkbox/star accessible names.
- Inbox already supports list + reading pane and responsive thread navigation.
- Loading uses skeletons.
- Category, search, batch selection, archive, preview and attachment capabilities exist.
- Sidebar already contains `QuantMail / by Quantrinity`.
- Brand package includes Indic font fallbacks and contrast utilities.

The redesign should consolidate these strengths, not discard working behaviour.

## Priority findings

### P0 — contrast failure

Many headings, helper labels and empty-state messages are nearly invisible on white surfaces. Selected and disabled settings states are hard to distinguish.

Required:

- semantic text roles with tested contrast;
- no opacity-based muted text below WCAG AA;
- automated checks for allowed token pairs;
- separate high-contrast verification.

### P0 — unclear scrolling and layout ownership

Screens show permanent sidebar and main scrollbars, oversized unused regions, narrow settings cards and a contact dialog whose action area can leave the viewport.

`AppShell` owns a `100dvh` frame and scrollable main region; `AppSidebar` owns another scroll region; page-specific CSS adds further overflow behaviour.

Required:

- one documented scroll owner per layout mode;
- responsive grid/max-width tokens;
- dialog body and persistent action regions;
- snapshots at 768, 1024, 1280, 1440 and 1920 px.

### P0 — raw service failure

Drive displays `Failed to fetch files` with a generic retry.

Required:

- product-level error mapping;
- state whether files remain safe;
- preserve cached content where possible;
- show retry/alternate action;
- keep technical correlation details secondary.

### P1 — auth and app feel unrelated

Auth uses purple gradient and dark forms; post-login changes to navy/white/black/blue.

Required:

- one surface system across auth and app;
- product accent used semantically;
- shared endorsement and transition from splash to workspace.

### P1 — navigation breadth exceeds workflow maturity

Mail, Calendar, Contacts, Drive, Repositories, Pipelines, Security and Settings are exposed with similar weight. Several are mostly generic empty pages.

Required:

- global product rail;
- mail-local navigation focused on communication;
- repositories/pipelines moved into a coherent Code workspace;
- cross-app context retained through references and product switching.

### P1 — empty states do not activate

Sent, Drafts, Trash, Contacts, Repositories and Pipelines reuse near-identical empty-state composition.

Every empty state must include a specific explanation, one primary action and—where relevant—templates, import, examples or setup progress.

### P1 — AI is split between context and generic chat

Inbox supports inline `QuantAI brief`, while `AIAssistant.tsx` uses a separate chat and routes intent through English substring checks. Screens show a floating mascot without visible workflow context.

Required:

- preserve inline summaries with evidence;
- replace substring intent with explicit commands;
- preview changes before execution;
- expose context, destination, cost and reversibility;
- treat global chat as a command surface, not the only AI entry.

### P1 — compose action hierarchy is weak

The editor dominates while send, autosave, attachment and security states are less clear. Tone chips compete with core writing.

Required:

- persistent send/autosave status;
- recipient identity resolution;
- progressive formatting;
- AI rewrite diff/preview;
- Drive insertion and attachments near the editor;
- schedule/signature/security in secondary disclosure.

### P1 — settings and security are ambiguous

Active tabs appear clipped; browser-like controls mix with custom cards; disabled fields are unclear; 2FA is represented as one button instead of setup and recovery.

Required:

- shared tabs, fields, switch and status components;
- complete 2FA setup, verification and recovery flow;
- clear session/app revocation scope;
- consistent save/cancel/dirty state.

### P2 — palette and token ownership are duplicated

`@quant/brand`, `@quant/shared-ui`, app CSS variables and direct values overlap. The base palette resembles generic Indigo/Amber/Slate scales.

Required:

- canonical primitives in `@quant/brand`;
- semantic aliases in Design OS;
- governed product accents;
- guard against unapproved direct colours in migrated surfaces.

### P2 — typography lacks a distinct display voice

Display and body both resolve to Inter. Indic fallbacks are valuable and must remain.

Required:

- evaluate licensable display/body pairing;
- retain Indic stacks;
- custom-draw the corporate wordmark;
- test mixed Hindi/English and numeric/data views.

### P2 — current mark is too complex at small sizes

The SVG includes a container, multiple gradients, duplicate paths, drop shadow, highlight and tiny central detail.

Required:

- separate core symbol from app-icon container;
- one recognisable ribbon silhouette;
- one-colour master and optical small-size variant;
- no effect required for recognition.

## Migration sequence

### Phase 0 — foundation

- freeze brand/design documents;
- obtain editable Figma access;
- create geometry and token variables;
- capture current critical-flow baselines.

### Phase 1 — system primitives

- consolidate token ownership;
- implement surface, type, focus, motion and responsive primitives;
- implement endorsement and product switcher;
- add contrast/token tests.

### Phase 2 — QuantMail flagship

1. splash/login/register;
2. shell and navigation;
3. populated inbox + reading pane;
4. thread + contextual intelligence;
5. compose + AI preview;
6. search and command palette;
7. activation/loading/partial-failure/offline states;
8. tablet/mobile.

### Phase 3 — adjacent workflows

- contacts/calendar;
- Drive context/recovery;
- settings/security;
- Code workspace boundary.

### Phase 4 — ecosystem rollout

Migrate one product at a time using the same gates. Do not clone QuantMail layout into products with different core tasks.

## Release gates

- no P0 contrast defects;
- no permanent nested scrollbars;
- keyboard completion for core scenarios;
- reviewed labels and focus order;
- complete empty/loading/error/offline/permission states;
- reduced-motion behaviour;
- approved responsive visual baselines;
- font/icon/motion performance budget;
- task-level acceptance tests from `QUANTMAIL_FLAGSHIP_UX.md`.

## First implementation boundary

The first implementation PR after foundations must be intentionally narrow: canonical foundation tokens plus the endorsed Quantrinity lockup in an isolated preview/test surface. It must not rewrite all 70 KB of global CSS or every product page at once.
