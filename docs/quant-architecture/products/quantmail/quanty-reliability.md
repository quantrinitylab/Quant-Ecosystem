# M16 — Quanty Reliability

Quanty must distinguish:
- model unavailable
- tool unavailable
- dependency unavailable
- task partially completed
- task verified complete

Quanty cannot convert a timeout into success.

For long-running tasks, persisted state allows reconnect/recovery.

If a tool partially succeeds, the user receives the verified partial state and safe recovery options.
