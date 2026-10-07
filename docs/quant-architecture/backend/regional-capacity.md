# M22 — Regional Capacity Planning

## Per-region metrics
Active users, mail volume, storage, egress, search load, realtime connections, worker queue age, provider capacity, and failover headroom.

## Headroom
Every production region maintains capacity for expected bursts and approved failover load.

## No false HA
A region cannot be considered failover-ready if the recovery region lacks tested capacity for the required workload.
