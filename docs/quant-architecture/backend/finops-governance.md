# M18 — FinOps Governance

## Ownership
Engineering owns technical efficiency; Finance owns financial controls; product owners own cost/value decisions; platform/SRE owns capacity safety.

## Required dashboards
- spend by product
- spend by workload
- spend by tenant tier
- unit cost trends
- committed vs burst capacity
- storage growth
- egress growth
- AI/search spend
- anomaly alerts

## Change review
Material architecture changes include expected capacity effect and unit-cost impact.

## Cost anomaly response
Detect → attribute → validate telemetry → determine workload/user/tenant cause → contain runaway usage → remediate → record decision.

Cost controls must never expose private content merely to explain a bill.
