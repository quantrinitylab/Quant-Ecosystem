# M18 — Scale Scenarios

## Scenario framework
Model at least:
- 100K users
- 1M users
- 10M users
- 100M users

For each scenario estimate active-user ratio, mailbox count, messages/day, storage growth, attachment traffic, search load, realtime connections, outbound/inbound delivery, and Quanty workload.

## Architecture response
At each threshold decide whether to:
- vertically scale
- add replicas
- partition/shard
- isolate tenants
- introduce dedicated clusters
- change retention/archive strategy
- introduce regional placement

## Important
User count alone does not determine capacity. Mail volume, attachment behavior, search intensity, realtime concurrency, and AI usage can dominate.
