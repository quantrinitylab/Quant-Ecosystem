# Quant Memory Ranking Engine

## Goal

Select the smallest set of useful, trustworthy memories for a task.

## Candidate sources

Structured memory, graph relationships, lexical retrieval, semantic retrieval, recent context, explicit user preferences, and source-authoritative lookups.

## Ranking order

1. authorization eligibility
2. source authority
3. explicit user confirmation
4. task relevance
5. freshness
6. confidence
7. recurrence/usefulness
8. relationship proximity
9. contradiction penalty
10. sensitivity minimization

## Authority hierarchy

Current canonical source state > explicit user-confirmed memory > attributable derived fact > inferred memory > weak behavioral signal.

## Diversity

Do not fill the context window with ten near-identical memories. Deduplicate by semantic and source relationship.

## Staleness

Old preferences and project states decay unless revalidated. Critical facts may require live source lookup instead of memory retrieval.
