# M24 — Enterprise SSO

## Supported federation
OIDC and SAML are supported according to enterprise tier/capability.

## Flow
Organization configuration → metadata validation → domain/identity verification → login initiation → assertion/token validation → principal mapping → organization membership evaluation → session creation.

## Controls
- signed assertions/tokens
- issuer/audience validation
- nonce/state protections
- certificate/key rotation
- clock-skew bounds
- domain ownership checks

SSO authenticates identity; it does not directly grant arbitrary application permissions.
