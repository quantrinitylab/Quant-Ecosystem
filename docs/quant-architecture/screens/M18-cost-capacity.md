# M18 — QuantMail Cost & Capacity

## Goal
Make infrastructure cost, capacity, and scaling first-class architecture concerns.

## Cost domains
- PostgreSQL compute, storage, IOPS, backups
- Redis
- Kafka/event relay
- search and vector indexes
- object storage
- CDN/egress
- SMTP/provider delivery
- attachment scanning
- worker compute
- observability
- Quanty inference/tool execution

## Core principle
Optimize for cost per verified user outcome, not raw infrastructure utilization.

## Capacity dimensions
Track active users, mailboxes, messages/day, stored messages, attachment GB, search queries, realtime connections, outbound mail, inbound mail, Quanty requests, and background jobs.

## Scaling stages
S = pilot, M = growth, L = enterprise, XL = hyperscale. Each stage has independent capacity limits and isolation policies.
