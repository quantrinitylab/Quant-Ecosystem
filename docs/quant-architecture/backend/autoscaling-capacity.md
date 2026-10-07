# M18 — Autoscaling & Capacity Planning

## Autoscaling inputs
Scale workers/services using a combination of:
- queue age
- service time
- CPU/memory
- database saturation
- connection pool wait
- search latency
- websocket connection count
- attachment throughput
- provider backpressure

## Anti-pattern
Never autoscale solely on CPU when the real bottleneck is PostgreSQL, a provider, network egress, or a fixed connection pool.

## Capacity model
For each service maintain:
- sustainable throughput
- saturation point
- safe operating point
- scale-up trigger
- scale-down trigger
- minimum fleet
- emergency ceiling

## Headroom
Normal operation retains explicit headroom for bursts, failures, maintenance, and noisy-neighbor isolation.

## Forecasting
Capacity planning uses observed growth trends plus scenario models. 10M/100M user scenarios are planning exercises, not claims of current readiness.
