# QuantMail Backend — Quanty Workspace Data Model

## agent_sessions

- id
- user_id
- surface
- state
- created_at
- updated_at
- expires_at

## agent_tasks

- id
- session_id
- goal
- plan_summary
- state
- created_at
- completed_at

## agent_steps

- id
- task_id
- sequence
- tool_id
- tool_version
- state
- input_hash
- result_summary
- started_at
- completed_at

Never persist raw tool inputs when they contain unnecessary private message content.

## approvals

- id
- task_id
- step_id
- action_summary
- target_summary
- risk_class
- expires_at
- decision
- decided_at
- decided_by

## verification_records

- id
- step_id
- expected_state
- observed_state
- status
- evidence_ref
- created_at

## memory_candidates

- id
- task_id
- proposed_memory
- sensitivity
- decision
- created_at

Durable memory requires the shared memory policy.
