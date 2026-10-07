# M14 — Trust & Security Testing

## Unit
- signal normalization
- policy decisions
- reputation buckets
- quarantine state machine
- feedback classification
- URL assessment
- attachment state

## Integration
- inbound mail
- attachment scanner
- URL service
- identity security
- delivery complaints
- quarantine
- admin policy

## Adversarial
- phishing URL
- malicious attachment
- spoofed sender
- forged security event
- report flooding
- reputation poisoning
- quarantine release replay
- stale scan capability
- cross-tenant reputation access

## Metrics
- spam precision/recall
- phishing detection precision/recall
- false-positive rate
- quarantine latency
- scan latency
- report-to-policy latency
- abuse detection latency

## E2E
1. inbound suspicious mail
2. authentication signals
3. security assessment
4. quarantine
5. user inspection
6. report/release
7. re-assessment
8. feedback recording
9. verify audit/events
