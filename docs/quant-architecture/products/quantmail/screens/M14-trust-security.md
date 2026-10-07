# M14 — Spam, Abuse, Trust & Security Intelligence

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Principle

Security intelligence is a decision-support layer. No single model score is authoritative.

## User surfaces

- Inbox warning
- Spam/quarantine
- Sender trust details
- Phishing warning
- Attachment security state
- Report spam/phishing
- False-positive recovery
- Security center

## Decision classes

ALLOW
WARN
QUARANTINE
REJECT
RATE_LIMIT
TEMPORARILY_BLOCK

Every decision has a policy reason and evidence class.

## UX

Warnings explain the actionable reason without exposing attacker-sensitive internals.

Users can report:
- spam
- phishing
- malicious content
- false positive

Security-critical warnings cannot be dismissed globally by a generic preference.

## Evidence

- obvious spam
- phishing signal
- suspicious sender
- malicious attachment
- false positive
- repeated abuse
- compromised-account signal
- quarantine release
- report feedback
