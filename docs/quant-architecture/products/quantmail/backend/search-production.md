# M12 Backend — Search Production Architecture

## Truth layers
1. Domain database
2. Transactional outbox
3. CDC/event relay
4. Search projection
5. Search index

Search indexes never become write authority.

## Pipeline
Domain mutation -> transaction commit -> outbox -> CDC relay -> normalization -> authorization projection -> lexical index -> optional embedding -> searchable state.

## Freshness
Each indexed document carries source version, indexed version and indexed_at.

Stale results must revalidate authorization/current state before sensitive action.

## Deletion
Deletion events remove or tombstone search documents with a bounded propagation SLA.

## Reindex
Support full, tenant, product, entity-type and single-object repair.
Jobs are resumable and idempotent.
