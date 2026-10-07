# M14 Backend — Trust Intelligence Domain

## Ownership

Trust owns:
- normalized security signals
- sender/domain reputation
- abuse scores
- classification decisions
- quarantine state
- user reports
- feedback outcomes

Mail remains authoritative for message/thread state.
Security platform remains authoritative for account/device security.

## Decision pipeline

message
-> authentication signals
-> content/URL/attachment signals
-> sender/domain reputation
-> behavioral signals
-> classifiers
-> policy engine
-> decision
-> action
-> feedback

## Model rule

Models produce signals and confidence, not final authorization.

Policy decides what action is allowed.
