# M13 — Bounce & Complaint Processing

## Classification

Permanent:
- invalid recipient
- rejected policy
- nonexistent mailbox

Temporary:
- mailbox full
- rate limited
- transient provider/server failure

Complaint:
- spam/abuse feedback
- provider-specific complaint signal

## Effects

Permanent bounce may suppress future automatic delivery to the affected recipient according to policy.

Complaint signals may trigger stronger sending restrictions.

No bounce parser may directly mutate unrelated account state.

## User experience

Show actionable reason without exposing raw provider internals.
