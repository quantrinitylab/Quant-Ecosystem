# Error Budget Exhaustion Runbook

## Description

The error budget for the service is exhausted or burning at an unsustainable rate.

## Severity

Critical

## Impact

The service has consumed its allowed failure budget. Further deployments should be halted until reliability improves.

## Detection

- Alert triggered when error budget remaining drops below 0% or burn rate exceeds 14.4x
- Monitor the error budget remaining metric
- Check the SLO burn rate dashboard for trends

## Investigation Steps

1. Review the SLO status dashboard for burn rate trends
2. Identify the time period when budget consumption accelerated
3. Correlate with deployment events or infrastructure changes
4. Check if specific endpoints or features are disproportionately failing
5. Review incident history for recurring issues

## Remediation Steps

1. Halt all non-critical deployments to the service
2. Prioritize reliability fixes over feature work
3. Implement targeted fixes for top error contributors
4. Consider enabling feature flags to disable unstable features
5. Schedule post-mortem to identify systemic improvements

## Escalation Path

1. On-call SRE (P1 - 5 min response)
2. Engineering manager (P1 - 15 min response)
3. VP Engineering for deployment freeze approval (P1 - 30 min response)

## Related Dashboards

- SLO Overview Dashboard
- Error Budget Dashboard
- Deployment History Dashboard
