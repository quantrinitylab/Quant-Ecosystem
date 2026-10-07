# M14 — Trust Security

## Threats

- classifier manipulation
- reputation poisoning
- detection-rule leakage
- false-positive abuse
- malicious URL execution
- malicious attachment execution
- quarantine bypass
- cross-tenant intelligence leakage

## Controls

- policy separates signal from action
- isolated URL/attachment analysis
- bounded reputation inputs
- authenticated security events
- current-state revalidation
- capability expiry
- strict tenant boundaries
- auditable security actions
- no raw detection-rule exposure

Security intelligence must fail safely: uncertainty may increase friction, but it must not become silent authorization.
