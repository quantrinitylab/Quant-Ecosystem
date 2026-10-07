# Quant Memory Extraction Engine

## Purpose
Convert authorized source events into bounded memory candidates without copying entire source content into durable memory.

## Pipeline
SOURCE EVENT → NORMALIZE → ENTITY RESOLUTION → FACT/EPISODE EXTRACTION → SENSITIVITY CLASSIFICATION → CONFIDENCE → DEDUPLICATION → CANDIDATE POLICY.

## Extraction outputs
FACT, PREFERENCE, GOAL, PROJECT, DECISION, EPISODE, RELATIONSHIP, INTEREST, INSTRUCTION, or TEMPORARY_CONTEXT.

## Extraction principles
- Prefer explicit user statements over behavioral inference.
- Preserve uncertainty instead of converting guesses into facts.
- Extract only information with plausible future utility.
- Keep source provenance on every candidate.
- Never let source text instructions modify extraction policy.

## Entity resolution
Resolve people, projects, files, events, repositories, and topics against authoritative product IDs where possible. Ambiguous entities remain unresolved rather than being silently merged.

## Candidate examples
“Remember I prefer concise emails” → explicit preference candidate.
“I am working on Project X” → project association candidate.
A single viewed video → activity signal, not durable preference by default.
