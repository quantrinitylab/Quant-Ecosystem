# M19 — Production Networking

## Edge
CDN/WAF terminates public traffic and applies abuse/rate controls before application ingress.

## Internal
Services communicate over authenticated internal networking. Sensitive databases and queues are not directly internet reachable.

## Segmentation
Separate public edge, application, data, worker, and management planes.

## Egress
Restrict outbound traffic by workload where practical. Mail providers, object storage, scanning services, and approved external APIs are explicit destinations.

## DNS
Use health-aware routing only where failover behavior is tested. DNS changes have controlled TTL and rollback procedures.
