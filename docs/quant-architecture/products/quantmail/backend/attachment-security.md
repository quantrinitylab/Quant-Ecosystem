# M14 — Attachment Security

## Pipeline

received attachment
-> type/size validation
-> malware scan
-> optional sandbox
-> classification
-> allow/block/quarantine
-> safe preview/download capability

## Rules

- extension is not trusted
- MIME is not trusted alone
- content signatures are validated
- executable/active content receives stronger controls
- previews are isolated
- blocked files never become downloadable through a stale capability

Scan results are versioned and expire when the object changes.
