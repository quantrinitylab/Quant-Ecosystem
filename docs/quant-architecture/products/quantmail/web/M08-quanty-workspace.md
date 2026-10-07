# QuantMail Web — M08 Quanty Workspace

## Layout

Desktop:
- docked panel or dedicated workspace
- compact task header
- context chips
- plan
- execution stream
- approval
- result
- verification

Mobile:
- full-screen workspace
- bottom approval sheet
- compact execution timeline

## UX rules

- do not animate fake work
- every progress state corresponds to real runtime state
- approval cannot be hidden in a generic chat message
- failures remain inspectable
- reconnect reconstructs state from server

## Deep links

A Quanty task can deep-link to:
- source thread
- source message
- attachment
- calendar event
- Drive file

The user must return to the task without losing task state.
