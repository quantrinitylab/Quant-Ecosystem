# M25 — Legal Holds

## Ownership
Lifecycle domains own actual retention/deletion execution; Compliance/Legal orchestrates hold instructions.

## Flow
REQUESTED → VALIDATING → APPLIED → VERIFIED → RELEASED.

## Behavior
A valid hold blocks covered deletion/expiry while allowing unaffected data to follow ordinary lifecycle.

## Verification
Hold coverage, affected domains, source objects, derived artifacts, and release status are auditable.

A hold must not become an unrestricted data-access mechanism.
