# M14 — URL & Phishing Intelligence

## Signals

- URL reputation
- domain age/reputation where legally and operationally available
- redirect chain characteristics
- authentication/context mismatch
- known malicious indicators
- display-text vs destination mismatch
- user reports

## Safety

Never fetch attacker-controlled URLs directly from the user-facing renderer.

URL inspection uses isolated infrastructure with:
- network restrictions
- timeouts
- content limits
- redirect limits
- logging controls

A suspicious URL is a signal; policy decides warning/quarantine behavior.
