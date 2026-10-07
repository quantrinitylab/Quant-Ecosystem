# M21 — QuantMail Privacy Architecture

## Goal
Make privacy enforceable through architecture rather than relying only on policy text.

## Privacy principles
1. Collect only what a declared purpose requires.
2. Purpose limitation is enforced at data-access boundaries.
3. User content is not telemetry by default.
4. Derived data inherits source privacy constraints.
5. AI/Quanty access is scoped, auditable, and policy-bound.
6. Deletion and export cover relevant derived data.
7. Privacy controls never weaken security controls.

## Data classes
Identity, message content, metadata, contacts, calendar context, files, security signals, telemetry, AI interaction records, derived embeddings, and billing records have distinct handling policies.
