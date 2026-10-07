# QuantChat C02 1:1 Chat — Testing

## Unit

- message status transitions sent->delivered->read
- optimistic rollback on send failure
- disappearing timer countdown
- reaction aggregation

## API integration

- contract tests for each endpoint used by this screen
- unauthorized access returns 401/403 without data leakage
- pagination/dedup behavior where lists are involved

## E2E

- send message
- receive via socket
- receipt updates
- refresh; history persists

## Visual regression

- capture: loading, empty, populated, error
- viewports: 390px, 768px, 1440px

## Completion gate

- C02 is complete only when implementation tests pass and evidence exists for each implemented state
- MISSING screens stay in the spec as explicit gaps, not silent omissions

