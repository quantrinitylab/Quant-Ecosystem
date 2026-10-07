# QuantMail Backend — Search Index

## Indexing architecture

Authoritative writes emit domain events.
Search indexers consume those events.

For mail:
- thread summary document
- message searchable fields
- participant tokens
- labels
- timestamps
- permission scope
- security flags

Never put unrestricted raw message content into a shared cross-domain index.

## Permission filtering

Every indexed mail object has a permission scope.
At query time:
1. authenticate
2. derive subject scope
3. apply mandatory permission filter
4. score eligible documents
5. return normalized results

## Freshness

Search is eventually consistent by design.
The API may report projection/index lag internally.

A recently created message must remain accessible through authoritative thread lookup even if search indexing has not caught up yet.

## Deletion

Delete events remove/hide searchable documents according to retention policy.
Legal/audit records are not equivalent to search documents.
