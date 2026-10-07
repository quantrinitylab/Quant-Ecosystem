# M41 — Quanty Cross-App Agent Control Plane

Quanty is the orchestration layer, not the owner of product state.

## Agent hierarchy
- User-facing Quanty agent: understands intent and presents plans.
- Workspace orchestrator: coordinates multiple product agents.
- Product agents: Mail, Calendar, Drive, Contacts, Git specialists.
- Tool executors: perform narrowly scoped product commands.
- Verifier: confirms postconditions from authoritative sources.

Agents share memory through typed context packages, not unrestricted internal state.

## Control protocol
1. Resolve intent.
2. Determine affected products.
3. Retrieve only permitted context.
4. Build plan with explicit product operations.
5. Classify risk.
6. Request approval for consequential operations.
7. Execute idempotent commands.
8. Verify authoritative postconditions.
9. Record action outcome and provenance.
10. Update bounded learning signals.

An agent cannot infer permission from a memory, previous approval, or prior successful action.
