# Quant Memory Domain

## Responsibilities

- memory candidate generation
- durable memory records
- memory classification
- provenance
- confidence/freshness
- memory lifecycle
- retrieval policy
- correction and suppression
- source deletion propagation
- memory audit

## Non-responsibilities

Quant Memory does not own Mail, Calendar, Contacts, Drive files, Git repositories, payment state, or product ranking policies.

## Memory classes

FACT, PREFERENCE, GOAL, PROJECT, DECISION, RELATIONSHIP, HABIT, INTEREST, EXPERIENCE, INSTRUCTION, EPISODE, TEMPORARY_CONTEXT, INFERENCE.

INFERENCE is explicitly non-factual and must not be presented as confirmed user truth.

## Sensitivity classes

PUBLIC_CONTEXT, PERSONAL, PRIVATE, HIGHLY_SENSITIVE, RESTRICTED. Sensitivity influences retrieval eligibility and retention.

## Record envelope

memoryId, type, subject, statement/representation, sourceRefs, provenance, confidence, sensitivity, createdAt, observedAt, lastValidatedAt, expiresAt, status, version, policyVersion.

## Candidate promotion

Source event → extraction → candidate → policy evaluation → optional user confirmation → active memory. High-sensitivity or low-confidence candidates require stricter policy and may remain ephemeral.

## Contradictions

Never silently overwrite conflicting memories. Maintain versions and provenance; resolve by explicit evidence/recency/policy or surface uncertainty.
