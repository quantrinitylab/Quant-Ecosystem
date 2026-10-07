# M22 — Multi-Region Data Architecture

## Data categories

### Regional authoritative
Mailbox content, attachments, tenant-private transactional data.

### Globally replicated control data
Service configuration, non-sensitive product metadata, deployment state where appropriate.

### Derived/rebuildable
Search projections, selected caches, analytics aggregates where policy permits.

## Replication
Replication is explicit per data class. No blanket “replicate everything globally” rule.

## Conflict policy
For authoritative user data, define a single-writer/authority model before enabling multi-writer behavior.
