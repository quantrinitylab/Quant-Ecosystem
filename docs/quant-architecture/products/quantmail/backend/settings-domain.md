# M10 Backend — Settings Domain

## No global settings table

Settings are stored by owning domain.

The platform may provide a typed settings registry for discovery, validation and UI metadata, but it does not become the source of truth.

## Setting contract

Every setting declares:
- settingId
- ownerDomain
- scope
- type
- default
- validation
- sensitivity
- mutability
- propagation mode
- audit requirement

## Scopes

- USER
- DEVICE
- PRODUCT
- ORGANIZATION

## Mutation

settings.read is a federated read.
settings.update routes to the owning domain.

Security-sensitive changes require re-authentication or step-up authentication.

## Conflict handling

Settings use version/etag semantics.
A stale update returns a conflict instead of silently overwriting a newer value.
