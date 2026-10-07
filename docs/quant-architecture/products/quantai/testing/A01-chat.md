# QuantAI A01 Chat — Testing

## Unit

- SSE chunk parsing
- conversation title derivation
- model switch state

## API integration

- contract tests for each endpoint used by this screen
- unauthorized access returns 401/403 without data leakage
- pagination/dedup behavior where lists are involved

## E2E

- send prompt
- stream completes
- refresh; history persists
- switch model mid-session

## Visual regression

- capture: loading, empty, populated, error
- viewports: 390px, 768px, 1440px

## Completion gate

- A01 is complete only when implementation tests pass and evidence exists for each implemented state
- MISSING screens stay in the spec as explicit gaps, not silent omissions

