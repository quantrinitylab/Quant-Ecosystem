# M22 — Global Mail Delivery

## Inbound
Receive mail through regional ingress where practical, validate security policy, then route to the mailbox's authoritative region.

## Outbound
Provider selection may consider recipient geography, reputation, latency, cost, and residency constraints.

## Correctness
Delivery state remains owned by the outbound delivery domain. Regional provider differences must not change user-visible state semantics.

## Failure
Provider/region failure causes bounded retry or alternate approved provider selection; never duplicate delivery after ambiguous submission.
