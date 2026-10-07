# M19 — Kubernetes Topology

## Workload classes
1. latency-sensitive API
2. WebSocket gateway
3. asynchronous workers
4. indexing/search workers
5. security/scan workers
6. scheduled maintenance jobs

## Scheduling
Use topology spread, anti-affinity, disruption budgets, resource requests/limits, and priority classes.

Critical services must not share a single failure domain unnecessarily.

## Autoscaling
Horizontal scaling uses service-specific metrics. Cluster capacity scales independently from application replicas.

## Isolation
Noisy tenants, reindex workloads, attachment scanning, and batch jobs use bounded worker pools and may receive dedicated node pools at scale.

## Shutdown
Pods drain gracefully, stop accepting new work, finish safe in-flight work, and preserve queue leases/checkpoints.
