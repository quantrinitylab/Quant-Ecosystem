# M16 — Backup & Restore

## Backup classes

- PostgreSQL transactional data
- object storage metadata
- critical configuration
- event offsets/checkpoints
- audit data according to retention policy

## Properties

Backups must be:
- encrypted
- access controlled
- versioned
- integrity checked
- monitored
- tested through restoration

A backup that has never been restored is not treated as proven recovery capability.

## Restore

Restore workflow:
identify incident -> choose recovery point -> restore isolated environment -> validate integrity -> reconcile events -> controlled cutover -> verify user-facing state
