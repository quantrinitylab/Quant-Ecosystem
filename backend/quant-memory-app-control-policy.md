# M41 — App Control Policy

Memory and authority are separate.

Capability examples:
mail.read/thread.write/draft.send
calendar.read/event.create/rsvp.write
drive.read/file.write/share.write
contacts.read/contact.write
git.repo.read/commit.write/pr.create

Risk tiers:
R0 read-only context
R1 reversible local mutation
R2 external communication or shared-state mutation
R3 financial/security/irreversible/high-impact action

R2/R3 requires explicit scoped approval unless an existing product policy explicitly authorizes a safe automation. Memory never elevates a capability.
