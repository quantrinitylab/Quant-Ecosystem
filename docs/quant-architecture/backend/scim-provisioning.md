# M24 — SCIM Provisioning

## Purpose
Synchronize enterprise users and groups with QuantMail.

## Operations
Create, update, deactivate, and group membership changes.

## Safety
SCIM deactivation must follow organization policy and should not immediately erase user data unless a separate lifecycle policy requires it.

## Idempotency
Provisioning operations are idempotent and correlate external IDs to internal principals.

## Failure
Partial synchronization is visible; retries do not duplicate members.
