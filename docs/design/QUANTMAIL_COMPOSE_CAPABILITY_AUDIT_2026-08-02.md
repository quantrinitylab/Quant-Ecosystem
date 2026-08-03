# QuantMail Compose Capability Audit — 2026-08-02

> Scope: active compose UI, AI rewrite path, attachment routes/service, draft scheduling, and undo-send queue on `main` at `1404e9bcd1e301798d36ef9a3fd3ebf594193350`.

## Executive finding

Compose contains several valuable interaction foundations—required-field validation, keyboard send/save, draft state, undo countdown, local file selection, AI actions, and a truthful scheduled-draft path. The next evolution must separate **working interaction** from **unverified infrastructure**.

The safest sequence is:

1. correct cross-platform shortcut copy;
2. add a real AI proposal-review boundary;
3. keep attachment selection explicitly local until storage and message inclusion are real;
4. keep scheduled delivery explicitly unavailable until a durable queue contract is wired to Compose.

## Evidence reviewed

- `apps/quantmail/src/components/EmailComposer.tsx`
- `apps/quantmail/src/app/compose/page.tsx`
- `apps/quantmail/backend/routes/attachments.ts`
- `apps/quantmail/backend/services/attachment.service.ts`
- `apps/quantmail/backend/services/undo-send.service.ts`
- attachment service and integration tests surfaced by repository search

## Boundary 1 — shortcut truthfulness

### Current truth

The component handler accepts either `metaKey` or `ctrlKey`:

- `Ctrl/Cmd + Enter` sends;
- `Ctrl/Cmd + S` saves a draft.

The visible badges claim only macOS shortcuts.

### Required patch

- `⌘ Enter` → `Ctrl/Cmd + Enter`
- `⌘ S` → `Ctrl/Cmd + S`

No handler, layout, persistence, routing, or backend change belongs in this boundary.

### Acceptance

- both modifier paths still work;
- labels match handlers;
- buttons do not overflow at supported widths;
- focus and disabled states are unchanged;
- focused CI and secret scanning pass.

## Boundary 2 — AI rewrite preview

### Current truth

The compose route calls `apiClient.aiCompose` and returns a generated body. `EmailComposer.handleAITone` immediately writes the result into `body` with `setBody(result)`.

The original is therefore replaced before the user receives a real comparison or apply decision.

### Target state model

```ts
type AIProposal = {
  action: 'compose' | 'improve' | 'shorten' | 'formalize';
  original: string;
  proposed: string;
};
```

Generation populates `AIProposal`; it does not mutate the editor body.

### Target interaction

- Original and Suggested content are visible in a bounded review surface.
- **Apply suggestion** replaces the body and clears the proposal.
- **Keep original** and **Cancel** preserve the body and clear the proposal.
- Regeneration is explicit.
- Generate/apply/cancel never save or send.
- Existing live-region announcements cover progress, failure, apply, and cancel.

### Acceptance

- original text survives generation and cancellation;
- only Apply mutates the editor;
- sending while a proposal is open sends the current editor body, never hidden proposal text;
- long content scrolls within the preview rather than expanding the entire workspace;
- keyboard and reduced-motion paths remain complete.

## Boundary 3 — attachment capability

### Existing strengths

The route layer already provides:

- authenticated upload-URL requests;
- filename/content-type/size validation;
- blocked executable extensions;
- an allowlist of document, archive, text, and image types;
- a 25 MB maximum;
- metadata and delete route shapes.

### Blocking gaps

The service currently:

- constructs an S3-style URL string rather than using a real signer;
- does not persist attachment metadata;
- does not verify upload completion;
- returns placeholder metadata for `document.pdf`;
- reports deletion without deleting storage or database state;
- is not connected to the active Compose attachment IDs/send contract.

### Decision

Keep the current **Select local files** and **Upload is not available** language. It is honest.

### Infrastructure sequence

1. Inject a real storage signer.
2. Persist pending attachment records by owner.
3. Verify uploaded object size/type and transition to ready state.
4. Add progress, retry, cancel, and delete.
5. Add verified attachment IDs to draft/send contracts.
6. Prove recipient access and owner deletion.
7. Only then promote UI copy to upload/attached.

## Boundary 4 — scheduled delivery

### Current truth

Compose writes `scheduledAt` while creating a draft. `handleSend` intentionally returns when `scheduledAt` exists. No arbitrary future delivery is triggered from the active compose route.

`UndoSendService` provides a separate delayed queue for a short undo window. It does not prove calendar-time scheduled delivery.

### Decision

Keep **Schedule draft** and **Delivery scheduling is not connected yet**.

### Durable contract required

- timezone-aware requested delivery time;
- durable delayed job tied to a persisted email/draft;
- edit and cancel;
- idempotency and worker-restart recovery;
- sender/policy revalidation at execution time;
- queued/sent/failed/cancelled states;
- visible state in Drafts and Sent;
- integration tests against the real queue boundary.

## Release rule

Visual polish cannot promote a capability. UI copy changes only after the underlying user-visible contract is verified end to end.