# M23 — OAuth & App Authorization

## App types
- first-party
- user-authorized third-party
- organization-installed
- service/integration application

## Authorization
Authorization Code + PKCE is the default interactive flow. Machine-to-machine flows use narrowly scoped credentials where supported.

## Rules
- redirect URIs are exact/validated
- state and nonce protections apply where relevant
- refresh tokens are protected and rotated according to policy
- scopes are explicit
- consent displays requested capabilities
- revocation is immediate at authorization layer

An OAuth token is not permission to bypass product-level authorization.
