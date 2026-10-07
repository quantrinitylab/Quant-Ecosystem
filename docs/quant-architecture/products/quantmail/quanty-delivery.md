# M13 — Quanty Delivery Integration

Quanty may:
- explain delivery failure
- summarize domain health
- identify likely recipient issues
- draft a recovery action
- prepare a resend after explicit user intent

Quanty may not:
- bypass sending limits
- alter authentication controls
- silently resend after timeout
- suppress bounce/complaint signals
- fabricate delivery success

For resend:
prepare -> validate current draft/message -> policy check -> explicit send flow.
