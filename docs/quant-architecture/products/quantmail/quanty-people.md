# QuantMail Quanty — People Context

## Read-only tools

people.resolve_sender
people.summarize_relationship
people.find_shared_context
people.find_contact

## Assistance examples

- "Who is this?"
- "Have I worked with this person recently?"
- "What meeting do we share?"

## Rules

Quanty must distinguish:
- canonical Contacts facts
- Mail interaction facts
- inferred relationship summaries

Private contact fields are returned only when the user is authorized.

Quanty cannot create/edit Contacts directly unless the product exposes an approved Contacts tool and policy.
