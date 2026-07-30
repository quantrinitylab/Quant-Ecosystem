# Quant Design OS

> A shared design operating system for every Quantrinity product. It is a product-quality contract, not a collection of attractive screenshots.

## 1. North star

Quantrinity should feel like one intelligent environment across communication, creation, storage, meetings, code and agents. Every surface must answer three questions immediately:

1. Where am I?
2. What matters now?
3. What can I accomplish next—with or without AI?

## 2. Core principles

### Outcome is the interface

Screens prioritise meaningful work, examples and recent context. Empty space is intentional only when it improves focus; an empty state must activate the next valuable action.

### AI is contextual

AI appears as commands, summaries, suggestions, previews and reversible actions within the current task. A global assistant may exist, but it cannot be the only AI surface.

### Dense, not cluttered

Professional products can contain many features when hierarchy is obvious. Use progressive disclosure, layered navigation and contextual panels rather than hiding capability behind blank pages.

### One family, distinct tools

All apps share semantic tokens, interaction rules, motion, accessibility and shell grammar. Product accents and task-specific components remain distinct.

### Trust is visible

Destructive, paid, external and AI-generated actions show scope, cost, destination, confidence and undo/recovery where relevant.

## 3. Foundation tokens

Tokens are semantic. Components must not depend directly on arbitrary hex values.

### Colour roles

- `canvas`: outer application background;
- `surface-1`: navigation and base panels;
- `surface-2`: cards, menus and editors;
- `surface-3`: selected/raised work areas;
- `text-strong`: primary content;
- `text-default`: standard body text;
- `text-muted`: supporting metadata that still passes contrast;
- `border-subtle`, `border-default`, `border-strong`;
- `action-primary`, `action-primary-hover`;
- `focus-ring`;
- `success`, `warning`, `danger`, `info`;
- `ai-context`: restrained intelligence indicator, not a universal neon wash.

Dark, light and high-contrast themes use the same roles. WCAG AA is the minimum acceptance bar.

### Typography roles

- `display`: launch, hero and major moments;
- `title`: workspace and page titles;
- `heading`: sections and cards;
- `body`: reading and forms;
- `label`: controls and metadata;
- `mono`: code, IDs and technical data.

Default body text must not fall below 14 px on desktop or 16 px in mobile form fields. Typography should use a deliberate display/body pairing; the current all-Inter strategy is not the final identity.

### Spacing and layout

Use a 4 px base scale with named semantic steps. Shell layout uses explicit regions instead of accidental nested scrolling:

- global/product rail;
- local navigation;
- primary workspace;
- optional contextual intelligence panel;
- overlays/command surfaces.

Only the region containing long content scrolls. Permanent double scrollbars are a release blocker.

### Shape

Radius communicates hierarchy:

- compact controls: 8–10 px;
- cards and menus: 12–16 px;
- hero/command surfaces: 18–24 px;
- pills only for statuses, compact filters and intentional segmented controls.

### Elevation

Dark-mode elevation is expressed primarily through luminance, border and local contrast. Large generic drop shadows are avoided.

### Motion

Motion explains relationship and state:

- fast feedback: 100–160 ms;
- component transition: 180–240 ms;
- panel/page choreography: 260–400 ms;
- brand signature: up to 900 ms.

Every motion has a reduced-motion equivalent.

## 4. Component contract

Every interactive component documents:

- default;
- hover;
- pressed;
- focus-visible;
- selected;
- disabled;
- loading;
- error;
- success where relevant;
- high-contrast behaviour;
- keyboard interaction;
- screen-reader name.

Minimum pointer target is 44×44 px unless adjacent spacing provides an equivalent accessible target.

## 5. System components

Foundation components:

- Button, IconButton, SplitButton;
- TextField, TextArea, SearchField, Select, Combobox;
- Checkbox, Radio, Switch, SegmentedControl;
- Tooltip, Popover, Menu, Dialog, Drawer;
- Tabs, Breadcrumb, Pagination;
- Badge, Status, Avatar, IdentityChip;
- Card, DataRow, DataTable;
- Toast, InlineNotice, Banner;
- Skeleton, Progress, EmptyState, ErrorState;
- CommandBar and CommandPalette.

Ecosystem components:

- ProductSwitcher;
- QuantrinityEndorsement;
- ContextPanel;
- AIAction and AIResultPreview;
- MemoryIndicator and MemoryCorrection;
- Cost/credit disclosure;
- PermissionScope;
- ActivityTimeline;
- UniversalAttachment;
- CrossAppReference.

## 6. Empty, loading and error states

### Empty

An empty state contains:

1. a specific explanation;
2. one primary action;
3. optional examples/templates/import path;
4. no low-contrast decorative filler.

### Loading

Preserve layout with skeletons. Do not replace the whole workspace with a spinner when partial data can load independently.

### Error

Show what failed, what remains safe, whether retry is automatic, and the next recovery action. Raw transport strings such as `Failed to fetch files` are never the final user message.

## 7. AI interaction rules

- AI output is previewed before high-impact execution.
- The user can inspect sources/context when available.
- Suggestions state what will change.
- External messages, purchases, deployments and destructive actions require explicit confirmation.
- Reversible actions expose undo.
- Memory-derived personalisation exposes correction and forgetting controls.
- AI colour is a semantic indicator, not a substitute for hierarchy.

## 8. Responsive behaviour

### Desktop

Supports multi-pane workflows and persistent context.

### Tablet

Collapses local navigation and contextual panels into drawers while keeping the primary task visible.

### Mobile

Uses one task per screen, bottom-safe actions, native-feeling navigation and no desktop table squeezed into a narrow viewport.

Target validation widths: 360, 390, 768, 1024, 1280, 1440 and 1920 px.

## 9. Quality gates

A UI migration cannot be declared complete without:

- contrast audit;
- full keyboard path;
- visible focus order;
- screen-reader labels;
- responsive snapshots;
- loading/empty/error/permission states;
- reduced-motion verification;
- visual regression baselines;
- no nested permanent scrollbars;
- performance budget for fonts, icons and animation;
- task-level acceptance test.

## 10. Migration rule

Do not rewrite every app simultaneously. Sequence:

1. freeze foundations;
2. build shared components;
3. prove the system in QuantMail's flagship flows;
4. measure usability/accessibility;
5. migrate one product surface at a time;
6. delete legacy styles only after verified parity.
