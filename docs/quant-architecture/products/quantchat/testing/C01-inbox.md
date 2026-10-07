# QuantChat C01 Inbox — Testing

## Unit

- conversation row state mapping
- unread badge derivation
- socket reconnect reconciliation

## API integration

- contract tests for each endpoint used by this screen
- unauthorized access returns 401/403 without data leakage
- pagination/dedup behavior where lists are involved

## E2E

- authenticate
- open /
- see conversation list
- open a thread
- return; list reflects read state

## Visual regression

- capture: loading, empty, populated, error
- viewports: 390px, 768px, 1440px

## Completion gate

- C01 is complete only when implementation tests pass and evidence exists for each implemented state
- MISSING screens stay in the spec as explicit gaps, not silent omissions

