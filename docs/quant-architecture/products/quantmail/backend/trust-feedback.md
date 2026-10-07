# M14 — Trust Feedback

## Inputs

- spam report
- phishing report
- not-spam action
- quarantine release
- delivery complaint
- security analyst outcome

## Processing

Feedback is attributed to a bounded source and used for:
- reputation updates
- classifier evaluation
- policy evaluation
- abuse investigations

User feedback does not instantly rewrite global reputation.

## Evaluation

Track:
- precision
- recall
- false-positive rate
- false-negative reports
- quarantine release rate
- time to resolution
- model/policy drift
