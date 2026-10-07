# Quant Memory Correction & User Control

## User actions

Remember, forget, correct, suppress, mark as temporary, set expiry, inspect source, and report incorrect memory where supported.

## Correction

A correction creates an explicit versioned memory update with provenance. It does not mutate the original source object unless the user intentionally edits that source.

## Forget

Forgetting a memory removes/suppresses the derived memory according to policy and propagates to derived indexes. It does not automatically delete the source content unless the user explicitly requests source deletion and has authority.

## Contradiction

If the user says a remembered preference is wrong, the old memory becomes superseded rather than silently disappearing from audit history where retention policy requires it.

## User visibility

Memory UI should provide understandable summaries, source links, freshness, and controls. Avoid exposing model internals or raw hidden chain-of-thought.
