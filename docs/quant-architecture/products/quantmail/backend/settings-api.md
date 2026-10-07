# M10 Backend — Settings API

## Read

settings.catalog
settings.get

The catalog returns metadata; values are returned only when the caller is authorized.

## Update

settings.update

Input:
- settingId
- scope
- expectedVersion
- value

The server resolves the owner domain and validates there.

## Security

settings.update may require:
- recent authentication
- MFA/passkey
- device confirmation

The client never decides whether step-up authentication is required.

## Device

devices.list
devices.revoke

Device revocation is owned by identity/security.

## Sessions

sessions.list
sessions.revoke
sessions.revoke_all

Session mutation is never delegated to Quanty.
