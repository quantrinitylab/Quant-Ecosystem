# M12 — Search, Indexing & Ranking Production Layer

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Principle
Search indexes are derived acceleration layers. PostgreSQL/domain services remain authoritative.

## Surfaces
- global search
- inbox search
- sender/person search
- attachment search
- calendar correlation
- Drive relation
- QuantGit relation
- natural-language Quanty search

## UX
Desktop: instant search, filters, result groups, keyboard navigation, preview/context rail.
Mobile: search-first screen, recent queries, filter chips, grouped results, canonical deep link.

Search must never expose unauthorized snippets.

## Result classes
exact, lexical, fuzzy, semantic, related

Every result declares source and route.

## Evidence
cold/warm query, typo, exact phrase, sender/date/attachment filters, semantic query, permission denial, deleted object, reindexed object.
