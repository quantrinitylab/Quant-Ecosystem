# M41 — Quant Memory + Cross-Product Agent Control System

## Purpose
Quanty agents must learn from governed shared memory and operate across the five QuantMail Workspace pillars without turning memory into an unrestricted control plane.

The architecture is:

Source products → typed events → memory extraction/classification → governed shared memory → context contracts → Quanty agent planner → capability/policy gate → product commands → verification → provenance + learning signal.

## Five-app ownership
- QuantMail: messages, threads, mail delivery state, labels, mail actions.
- QuantCalendar: events, attendees, RSVP, recurrence, availability.
- QuantDrive: files, folders, versions, sharing and the memory substrate.
- QuantContacts: canonical people/profile data and relationship identity.
- QuantGit: repositories, branches, commits, issues, pull requests, CI/developer state.

Memory connects these systems but never becomes source-of-truth for them.

## Shared memory model
Every memory carries: owner, source app, source object, memory class, representation, provenance, confidence, explicitness, sensitivity, freshness, validity window, permissions, policy version and lifecycle status.

Memory classes:
1. Canonical reference — pointer to authoritative product state.
2. User preference — explicit or strongly attributable preference.
3. Task/goal — active intent with expiry.
4. Project context — cross-app working context.
5. Relationship context — bounded interaction history.
6. Episodic memory — important past event.
7. Semantic knowledge — durable learned knowledge with provenance.
8. Temporary context — session/current-task signals.
9. Inference signal — uncertain ranking signal, never silently promoted to fact.
10. Agent action memory — what an agent proposed, executed, verified, failed or learned.

## Agent control
Agents do not receive raw shared memory. A typed context package is assembled for the requested task, policy-filtered, redacted and budgeted.

An agent action always follows:
intent → context → plan → authorization → risk classification → approval if required → product command → verification → memory/provenance update.

The agent remembers what happened; it does not gain permanent authority because it remembers.

## Learning
Learning is bounded:
- explicit user corrections have highest preference weight;
- successful verified actions can improve future planning;
- failed actions create negative execution evidence;
- stale assumptions decay;
- model inference never becomes a user fact without evidence;
- source changes invalidate dependent context.

## UX principle
Memory must be visible, inspectable and correctable. Users can see where a memory came from, which app contributed it, when it was last verified, what it influences, and forget/correct/suppress it.

## Example
“Prepare my Monday meeting.”
Quanty can retrieve the meeting from Calendar, participants from Contacts, relevant mail threads from Mail, files from Drive, and related PR/issues from Git. It then presents a plan and asks for approval before consequential actions. It never crawls databases directly.

## Non-negotiable laws
1. Shared memory is governed context, not shared authority.
2. Source products remain authoritative.
3. Current source state beats stale memory.
4. Every durable memory has provenance.
5. Every agent action has an audit trail and verification state.
6. Product permissions apply before memory retrieval.
7. Sensitive context is purpose-bound.
8. Forgetting propagates to derived indexes and agent context.
9. Quanty receives minimum useful context.
10. Cross-app intelligence must fail soft; core product use must continue if memory is unavailable.
