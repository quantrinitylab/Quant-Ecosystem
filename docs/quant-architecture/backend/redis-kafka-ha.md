# M19 — Redis & Kafka HA

## Redis
Separate caching from critical coordination semantics. Define persistence/replication only where required by the workload. Cache loss must be survivable.

## Kafka/Event Relay
Use replicated brokers, partition strategy, consumer groups, retention policy, and monitored lag.

Events are durable integration records only when the producer's contract requires durability; ephemeral UI updates should not create unlimited retained traffic.

## Failure
Consumers resume from checkpoints. Duplicate delivery is expected and handled through idempotency.

## Capacity
Monitor partition skew, broker disk, producer latency, consumer lag, rebalance frequency, and hot keys.
