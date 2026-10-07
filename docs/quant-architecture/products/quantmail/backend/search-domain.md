# QuantMail Backend — Universal Search Domain

## Ownership model

QuantMail owns:
- mail index adapter
- message/thread search semantics
- mail result permissions
- mail relevance features

Platform search owns:
- query fan-out
- normalization
- aggregation
- pagination strategy
- cross-domain ranking envelope
- partial failure handling

Each product remains the source of truth for object reads.

## Query lifecycle

1. authenticate
2. normalize query
3. derive enabled domains
4. issue bounded parallel domain searches
5. enforce permission checks at adapter level
6. normalize results
7. rank/merge
8. return page plus continuation token

## Failure isolation

If Drive is unavailable:
- Mail, People, Calendar and Git may still return
- response contains domain status
- retry is scoped to failed domain where possible

A domain adapter must never return unauthorized objects merely to improve recall.
