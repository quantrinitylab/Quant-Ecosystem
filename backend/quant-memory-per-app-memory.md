# M41 — Per-App Memory Views

Shared memory is one governed substrate, but every app gets a purpose-bound view.

Mail view: communication preferences, threads, participants, pending replies, deadlines and related context.
Calendar view: scheduling preferences, attendees, prior meetings, availability and time-zone context.
Drive view: projects, files, collaborators, versions and document context.
Contacts view: canonical identity plus bounded interaction/relationship context.
Git view: repositories, coding workflow, projects, issues, PRs, review habits and active work.

The same underlying memory may be referenced by multiple views, but each view applies its own product policy and minimum-context contract.
