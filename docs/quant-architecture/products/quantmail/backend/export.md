# M15 — Data Export

## Export lifecycle

REQUESTED -> AUTHORIZING -> PREPARING -> READY -> EXPIRED

Failure:
PREPARING -> FAILED

## Export

Exports are generated asynchronously.

Export manifest declares:
- scope
- data classes
- time range
- generated_at
- policy/version
- expiration
- checksum

## Security

Export access is authenticated and authorized.
Download capability is short-lived.
Large exports are streamed/object-backed rather than loaded into application memory.

Exports must not contain data outside the requester's authorized scope.
