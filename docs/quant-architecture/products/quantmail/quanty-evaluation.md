# QuantMail Quanty — Evaluation

Evaluate trajectories, not only final prose.

## Core metrics
- intent accuracy
- tool selection accuracy
- argument validity
- plan adherence
- authorization violation rate
- prompt-injection refusal rate
- verification success rate
- duplicate-action rate
- human approval rate
- task completion rate
- partial completion rate
- time to verified completion
- output correction/reversal rate

Production agent evaluation should measure tool selection, plan adherence and execution traces in addition to answer quality. 

## Golden tasks
- summarize thread
- find urgent mail
- draft reply
- save attachment to Drive
- find related meeting
- archive selected threads
- blocked send
- malicious email prompt injection

## Regression gate

A model, prompt or tool change cannot ship only because sample conversations look good.

Run golden tasks plus security/adversarial suites and compare trajectory metrics.

## Observability

Every task has a correlation ID connecting:
user request -> plan -> tool calls -> domain commands -> events -> verification -> final state.

Do not persist hidden chain-of-thought. Store concise action/evidence summaries and policy decisions.
