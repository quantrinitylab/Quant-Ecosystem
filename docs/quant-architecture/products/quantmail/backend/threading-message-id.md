# M13 — Message and Thread Identity

## Message identity

Preserve RFC Message-ID when trustworthy and available.

Store internal immutable message ID separately.

## Reply correlation

Use:
- In-Reply-To
- References
- provider thread metadata where available
- normalized participants
- subject fallback only as bounded inference

Never merge threads solely because subjects are equal.

## Provider differences

Provider-specific thread identifiers are metadata, not universal truth.

Thread domain decides canonical thread membership.
