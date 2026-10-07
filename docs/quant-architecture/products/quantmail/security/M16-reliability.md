# M16 — Reliability Security

## Threats
- telemetry data leakage
- malicious retry amplification
- forged health signals
- replayed recovery commands
- backup theft
- restore of compromised data
- incident information leakage

## Controls
- least-privilege observability access
- bounded/redacted telemetry
- authenticated health events
- idempotent recovery commands
- encrypted backups
- restore malware/integrity checks
- audited operational access
- separate recovery credentials

Reliability mechanisms must not weaken authorization or security policy.
