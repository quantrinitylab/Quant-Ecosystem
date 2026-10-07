# M15 — Derived Data Lifecycle

Derived data includes:
- search documents
- embeddings
- notification previews
- cached snippets
- recommendation features
- temporary previews
- model-processing artifacts

## Rule

Derived data cannot outlive the source beyond its declared policy unless an explicit policy permits it.

Source deletion/restriction produces invalidation work.

## Verification

Lifecycle jobs report:
- source version
- derived target
- action
- result
- retry state

Missing derived cleanup is observable and repairable.
