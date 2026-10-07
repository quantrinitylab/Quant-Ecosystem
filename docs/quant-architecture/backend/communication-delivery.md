# Communication Delivery

Pipeline:
request → validate → policy/consent → render → provider selection → queue → dispatch → provider reconciliation → final state.

Delivery is idempotent.

Timeout after provider submission becomes UNKNOWN until reconciled, preventing duplicate sends.
