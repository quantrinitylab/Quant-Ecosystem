# M39 — QuantDrive UI State Matrix

## Browsing
Loading, empty home, empty folder, no search results, stale/cache, reconnecting, permission denied, folder unavailable, partial metadata.

## Upload
Queued, uploading, paused, retrying, scanning, available, blocked, failed, cancelled, duplicate/conflict, destination unavailable.

## Preview
Preparing, scanning, available, unsupported, preview unavailable, download unavailable, deleted/expired, permission denied, provider unavailable.

## Sharing
Current access loading, proposed change, validation error, saving, saved/verified, failed, permission changed concurrently, link expired.

## Versions
Loading, version available, restore confirmation, restore pending, restored/verified, restore failed, version expired/retained policy.

## Trash
Deleted pending, recoverable, restore pending, restored, permanently deleting, deletion blocked by policy/hold.

## Rule
Never display an optimistic destructive or security-sensitive state as authoritative. Pending operations must be distinguishable from confirmed Drive state.
