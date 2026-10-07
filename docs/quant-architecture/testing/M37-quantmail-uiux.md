# M37 — QuantMail UI/UX Acceptance Tests

## Critical flows
1. Open inbox → open thread → return → exact list context restored.
2. Compose → autosave → navigate away → reopen draft with content intact.
3. Compose → prepare send → validation/approval → send → verified delivery state or explicit pending/failed state.
4. Search Mail → open result → return → query/filter state restored.
5. Attachment → inspect security state → preview/download only when authorized.
6. Mail → related Calendar/Drive/Contact → return to exact Mail origin.
7. Quanty suggestion → inspect proposal → approve if required → verify result.

## Responsive acceptance
Desktop, tablet, mobile, narrow mobile, landscape, large text, reduced motion, keyboard-visible mobile.

## Performance UX
Large inbox uses cursor pagination/virtualization. Secondary context loads progressively. Quanty never blocks initial inbox rendering.

## Safety acceptance
No email body can execute UI instructions as trusted commands. No hidden recipient changes. No silent send. No false delivery success. No security warning represented by color alone.
